import { neon } from "@neondatabase/serverless";
import { createClient } from "@supabase/supabase-js";
import { get, put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parse, serialize } from "cookie";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import type {
  AnnotationInboxItem,
  LinkShareProject,
  LinkShareAuthStatus,
  LiteSyncPayload,
  PublicationAnnotationSnapshot,
  ShareAccessMode,
  ShareAnnotation,
} from "../shared/collaboration";
import {
  createShareAccessSession,
  isShareAccessCodeHash,
  SHARE_ACCESS_COOKIE,
  SHARE_ACCESS_SESSION_MAX_AGE_SECONDS,
  verifyShareAccessCode,
  verifyShareAccessSession,
} from "../server/collaboration/access-code.js";

type Row = Record<string, unknown>;
type LiteViewer = {
  email: string;
  name: string;
  role: "internal" | "external";
};
type SupabaseAuthAdapter = {
  getUser(accessToken: string): Promise<{
    data: { user: { email?: string | null } | null };
    error: { message: string } | null;
  }>;
  signInWithOtp(input: {
    email: string;
    options: { shouldCreateUser: boolean; data: { display_name: string } };
  }): Promise<{ error: { message: string } | null }>;
  verifyOtp(input: { email: string; token: string; type: "email" }): Promise<{
    data: { session: { access_token: string } | null };
    error: { message: string } | null;
  }>;
};

const LITE_AUTH_COOKIE = "cofound_lite_auth";

const tokenSchema = z.string().min(20).max(200);
const idSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const commentSchema = z.object({
  authorName: z.string().trim().min(1).max(80),
  authorEmail: z.string().email().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(2000),
  fileId: idSchema.nullable().optional(),
  fieldKey: z.string().trim().min(1).max(100).nullable().optional(),
  pageNumber: z.number().int().min(1).max(1000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL 未配置");
  return neon(connectionString);
}

function supabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function supabaseAuth() {
  const client = supabase();
  return client ? (client.auth as unknown as SupabaseAuthAdapter) : null;
}

function authError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

function publicBaseUrl(request: VercelRequest) {
  const configured = process.env.COF_BP_PUBLIC_BASE_URL?.replace(/\/$/u, "");
  if (configured) return configured;
  const protocol = value(request.headers["x-forwarded-proto"]) || "https";
  const host =
    value(request.headers["x-forwarded-host"]) || request.headers.host;
  return `${protocol}://${host}`;
}

function requireSameOrigin(request: VercelRequest) {
  const origin = request.headers.origin;
  if (!origin) return;
  const protocol = value(request.headers["x-forwarded-proto"]) || "https";
  const host =
    value(request.headers["x-forwarded-host"]) || request.headers.host;
  const allowed = new Set([
    new URL(publicBaseUrl(request)).origin,
    `${protocol}://${host}`,
  ]);
  if (!allowed.has(new URL(origin).origin)) {
    const error = new Error("请求来源不在允许范围内");
    Object.assign(error, { status: 403 });
    throw error;
  }
}

function requireSyncToken(request: VercelRequest) {
  const expected = process.env.COF_BP_LITE_SYNC_TOKEN;
  const supplied =
    request.headers.authorization?.replace(/^Bearer\s+/iu, "") ?? "";
  if (!expected || supplied.length !== expected.length) {
    const error = new Error("同步凭据无效");
    Object.assign(error, { status: 401 });
    throw error;
  }
  const valid = crypto.timingSafeEqual(
    Buffer.from(supplied),
    Buffer.from(expected)
  );
  if (!valid) {
    const error = new Error("同步凭据无效");
    Object.assign(error, { status: 401 });
    throw error;
  }
}

async function projectByToken(token: string) {
  const rows = (await database().query(
    `SELECT * FROM lite_projects
     WHERE share_token = $1 AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [token]
  )) as Row[];
  if (!rows[0]) {
    const error = new Error("分享链接不存在、已停止或已经过期");
    Object.assign(error, { status: 404 });
    throw error;
  }
  return rows[0];
}

async function memberForProject(publicationId: string, email: string) {
  const rows = (await database().query(
    `SELECT email, name, role FROM lite_members
     WHERE publication_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`,
    [publicationId, email]
  )) as Row[];
  if (!rows[0]) return null;
  return {
    email: String(rows[0].email),
    name: String(rows[0].name),
    role: String(rows[0].role) as LiteViewer["role"],
  } satisfies LiteViewer;
}

async function memberCount(publicationId: string) {
  const rows = (await database().query(
    "SELECT COUNT(*)::int AS count FROM lite_members WHERE publication_id = $1",
    [publicationId]
  )) as Row[];
  return Number(rows[0]?.count ?? 0);
}

async function projectAccessMode(project: Row): Promise<ShareAccessMode> {
  if (
    project.access_mode === "passcode" ||
    project.access_mode === "member_email"
  )
    return project.access_mode;
  if (project.access_mode === "open") return "open";
  return (await memberCount(String(project.publication_id))) > 0
    ? "member_email"
    : "open";
}

async function authorizedViewer(
  request: VercelRequest,
  project: Row,
  required = true
): Promise<{
  accessMode: ShareAccessMode;
  authenticated: boolean;
  viewer: LiteViewer | null;
}> {
  const publicationId = String(project.publication_id);
  const accessMode = await projectAccessMode(project);
  if (accessMode === "open")
    return { accessMode, authenticated: true, viewer: null };
  if (accessMode === "passcode") {
    const accessCodeHash =
      typeof project.access_code_hash === "string"
        ? project.access_code_hash
        : "";
    if (!accessCodeHash) throw authError("该分享的访问码配置不完整", 503);
    const session = parse(value(request.headers.cookie) ?? "")[
      SHARE_ACCESS_COOKIE
    ];
    const authenticated = verifyShareAccessSession(
      String(project.share_token),
      accessCodeHash,
      session
    );
    if (!authenticated && required) throw authError("请输入 6 位访问码", 401);
    return { accessMode, authenticated, viewer: null };
  }
  const accessToken = parse(value(request.headers.cookie) ?? "")[
    LITE_AUTH_COOKIE
  ];
  const auth = supabaseAuth();
  if (!auth) {
    if (!required) return { accessMode, authenticated: false, viewer: null };
    throw authError("邮箱验证码服务尚未配置", 503);
  }
  if (!accessToken) {
    if (!required) return { accessMode, authenticated: false, viewer: null };
    throw authError("请先使用受邀邮箱验证身份", 401);
  }
  const { data, error } = await auth.getUser(accessToken);
  const email = data.user?.email?.toLocaleLowerCase();
  if (error || !email) {
    if (!required) return { accessMode, authenticated: false, viewer: null };
    throw authError("登录状态已失效，请重新验证邮箱", 401);
  }
  const member = await memberForProject(publicationId, email);
  if (!member) {
    if (!required) return { accessMode, authenticated: false, viewer: null };
    throw authError("当前邮箱没有这个项目的查看权限", 403);
  }
  return { accessMode, authenticated: true, viewer: member };
}

async function authStatus(request: VercelRequest, response: VercelResponse) {
  const token = tokenSchema.parse(value(request.query.token));
  const project = await projectByToken(token);
  const access = await authorizedViewer(request, project, false);
  const result: LinkShareAuthStatus = {
    accessMode: access.accessMode,
    required: access.accessMode !== "open",
    authenticated: access.authenticated,
    viewer: access.viewer,
    providerConfigured:
      access.accessMode === "member_email" ? Boolean(supabaseAuth()) : true,
  };
  response.setHeader("Cache-Control", "private, no-store");
  response.status(200).json(result);
}

async function requestEmailOtp(
  request: VercelRequest,
  response: VercelResponse
) {
  requireSameOrigin(request);
  const token = tokenSchema.parse(value(request.query.token));
  const input = z
    .object({ email: z.string().email().max(200) })
    .parse(request.body);
  const project = await projectByToken(token);
  if ((await projectAccessMode(project)) !== "member_email")
    throw authError("该分享未启用邮箱成员验证", 400);
  const email = input.email.trim().toLocaleLowerCase();
  const member = await memberForProject(String(project.publication_id), email);
  if (!member) throw authError("该邮箱没有这个项目的查看权限", 403);
  const auth = supabaseAuth();
  if (!auth) throw authError("邮箱验证码服务尚未配置", 503);
  const { error } = await auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { display_name: member.name } },
  });
  if (error) throw authError(`验证码发送失败：${error.message}`, 502);
  response.status(200).json({
    ok: true,
    maskedEmail: `${email.slice(0, 2)}***@${email.split("@")[1]}`,
  });
}

async function verifyEmailOtp(
  request: VercelRequest,
  response: VercelResponse
) {
  requireSameOrigin(request);
  const shareToken = tokenSchema.parse(value(request.query.token));
  const input = z
    .object({
      email: z.string().email().max(200),
      token: z
        .string()
        .trim()
        .regex(/^\d{6}$/u),
    })
    .parse(request.body);
  const project = await projectByToken(shareToken);
  if ((await projectAccessMode(project)) !== "member_email")
    throw authError("该分享未启用邮箱成员验证", 400);
  const email = input.email.trim().toLocaleLowerCase();
  const member = await memberForProject(String(project.publication_id), email);
  if (!member) throw authError("该邮箱没有这个项目的查看权限", 403);
  const auth = supabaseAuth();
  if (!auth) throw authError("邮箱验证码服务尚未配置", 503);
  const { data, error } = await auth.verifyOtp({
    email,
    token: input.token,
    type: "email",
  });
  if (error || !data.session?.access_token)
    throw authError("验证码无效或已经过期", 401);
  response.setHeader(
    "Set-Cookie",
    serialize(LITE_AUTH_COOKIE, data.session.access_token, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    })
  );
  response.status(200).json({ viewer: member });
}

async function verifyPasscode(
  request: VercelRequest,
  response: VercelResponse
) {
  requireSameOrigin(request);
  const shareToken = tokenSchema.parse(value(request.query.token));
  const input = z
    .object({ accessCode: z.string().regex(/^\d{6}$/u) })
    .parse(request.body);
  const project = await projectByToken(shareToken);
  if ((await projectAccessMode(project)) !== "passcode")
    throw authError("该分享未启用访问码", 400);
  const accessCodeHash =
    typeof project.access_code_hash === "string"
      ? project.access_code_hash
      : "";
  if (!accessCodeHash) throw authError("该分享的访问码配置不完整", 503);
  const forwarded = value(request.headers["x-forwarded-for"])?.split(",")[0];
  const address =
    forwarded?.trim() || request.socket.remoteAddress || "unknown";
  const attemptKey = crypto.createHash("sha256").update(address).digest("hex");
  const attempts = (await database().query(
    `SELECT failures, window_started_at, blocked_until
     FROM lite_access_attempts
     WHERE publication_id = $1 AND attempt_key = $2`,
    [String(project.publication_id), attemptKey]
  )) as Row[];
  const attempt = attempts[0];
  if (
    attempt?.blocked_until &&
    new Date(String(attempt.blocked_until)).getTime() > Date.now()
  )
    throw authError("访问码尝试次数过多，请稍后再试", 429);
  if (!verifyShareAccessCode(input.accessCode, accessCodeHash)) {
    const inWindow =
      attempt?.window_started_at &&
      Date.now() - new Date(String(attempt.window_started_at)).getTime() <
        10 * 60_000;
    const failures = inWindow ? Number(attempt.failures ?? 0) + 1 : 1;
    const blockedUntil =
      failures >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
    await database().query(
      `INSERT INTO lite_access_attempts(
         publication_id, attempt_key, failures, window_started_at, blocked_until
       ) VALUES ($1,$2,$3,NOW(),$4)
       ON CONFLICT(publication_id, attempt_key) DO UPDATE SET
         failures = EXCLUDED.failures,
         window_started_at = CASE
           WHEN lite_access_attempts.window_started_at > NOW() - INTERVAL '10 minutes'
             THEN lite_access_attempts.window_started_at
           ELSE NOW()
         END,
         blocked_until = EXCLUDED.blocked_until`,
      [
        String(project.publication_id),
        attemptKey,
        failures,
        blockedUntil?.toISOString() ?? null,
      ]
    );
    throw authError(
      blockedUntil ? "访问码尝试次数过多，请稍后再试" : "访问码不正确",
      blockedUntil ? 429 : 401
    );
  }
  await database().query(
    "DELETE FROM lite_access_attempts WHERE publication_id = $1 AND attempt_key = $2",
    [String(project.publication_id), attemptKey]
  );
  const session = createShareAccessSession(shareToken, accessCodeHash);
  response.setHeader(
    "Set-Cookie",
    serialize(SHARE_ACCESS_COOKIE, session, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: SHARE_ACCESS_SESSION_MAX_AGE_SECONDS,
    })
  );
  response.status(200).json({ ok: true, accessMode: "passcode" });
}

function annotation(row: Row): ShareAnnotation {
  return {
    id: String(row.id),
    publicationId: String(row.publication_id),
    fileId: typeof row.file_id === "string" ? row.file_id : null,
    fieldKey: typeof row.field_key === "string" ? row.field_key : null,
    pageNumber: row.page_number === null ? null : Number(row.page_number),
    parentId: typeof row.parent_id === "string" ? row.parent_id : null,
    authorName: String(row.author_name),
    authorEmail: typeof row.author_email === "string" ? row.author_email : null,
    body: String(row.body),
    status: String(row.status) as ShareAnnotation["status"],
    revision: Number(row.revision),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function annotations(publicationId: string, after = 0) {
  const rows = (await database().query(
    `SELECT * FROM lite_annotations
     WHERE publication_id = $1 AND revision > $2
     ORDER BY revision ASC LIMIT 500`,
    [publicationId, Math.max(0, after)]
  )) as Row[];
  return rows.map(annotation);
}

function inboxAnnotation(row: Row): AnnotationInboxItem {
  return {
    id: String(row.id),
    publicationId: String(row.publication_id),
    sourceFileId:
      typeof row.source_file_id === "string" ? row.source_file_id : null,
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    fieldKey: typeof row.field_key === "string" ? row.field_key : null,
    pageNumber: row.page_number === null ? null : Number(row.page_number),
    parentId: typeof row.parent_id === "string" ? row.parent_id : null,
    authorName: String(row.author_name),
    body: String(row.body),
    status: String(row.status) as AnnotationInboxItem["status"],
    revision: Number(row.revision),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function adminAnnotations(
  request: VercelRequest,
  response: VercelResponse
) {
  requireSyncToken(request);
  const publicationId = idSchema.parse(value(request.query.publicationId));
  const projectRows = (await database().query(
    `SELECT publication_id, local_project_id, project_name, remote_version,
            annotation_revision
       FROM lite_projects
      WHERE publication_id = $1
      LIMIT 1`,
    [publicationId]
  )) as Row[];
  const project = projectRows[0];
  if (!project)
    throw Object.assign(new Error("远端共享项目不存在"), { status: 404 });

  const rows = (await database().query(
    `SELECT annotation.*, file.source_file_id,
            file.original_name AS file_name
       FROM lite_annotations annotation
       LEFT JOIN lite_files file ON file.id = annotation.file_id
      WHERE annotation.publication_id = $1
      ORDER BY annotation.created_at DESC, annotation.revision DESC
      LIMIT 501`,
    [publicationId]
  )) as Row[];
  const result: PublicationAnnotationSnapshot = {
    publicationId: String(project.publication_id),
    projectId: String(project.local_project_id),
    projectName: String(project.project_name),
    remoteVersion: Number(project.remote_version),
    revision: Number(project.annotation_revision),
    truncated: rows.length > 500,
    fetchedAt: new Date().toISOString(),
    annotations: rows.slice(0, 500).map(inboxAnnotation),
  };
  response.setHeader("Cache-Control", "private, no-store");
  response.status(200).json(result);
}

async function share(request: VercelRequest, response: VercelResponse) {
  const token = tokenSchema.parse(value(request.query.token));
  const projectRow = await projectByToken(token);
  const access = await authorizedViewer(request, projectRow);
  const project = projectRow.snapshot_json as LinkShareProject;
  const fileRows = (await database().query(
    "SELECT * FROM lite_files WHERE publication_id = $1 ORDER BY created_at",
    [String(projectRow.publication_id)]
  )) as Row[];
  const result: LinkShareProject = {
    ...project,
    shareToken: token,
    revision: Number(projectRow.annotation_revision),
    annotationEnabled: Boolean(projectRow.annotation_enabled),
    downloadEnabled: false,
    viewer: access.viewer,
    files: fileRows.map(row => ({
      id: String(row.id),
      originalName: String(row.original_name),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      pageCount: Number(row.page_count),
      securityMode: "trusted",
      canRequestDownload: false,
      viewerUrl: `/api/lite?action=file&token=${encodeURIComponent(token)}&fileId=${encodeURIComponent(String(row.id))}`,
    })),
    annotations: await annotations(String(projectRow.publication_id)),
  };
  response.setHeader("Cache-Control", "private, no-store");
  response.status(200).json(result);
}

async function listComments(request: VercelRequest, response: VercelResponse) {
  const token = tokenSchema.parse(value(request.query.token));
  const project = await projectByToken(token);
  await authorizedViewer(request, project);
  const after = Math.max(0, Number(value(request.query.after) ?? 0));
  response.setHeader("Cache-Control", "private, no-store");
  response.status(200).json({
    revision: Number(project.annotation_revision),
    annotations: await annotations(String(project.publication_id), after),
  });
}

async function createComment(request: VercelRequest, response: VercelResponse) {
  requireSameOrigin(request);
  const token = tokenSchema.parse(value(request.query.token));
  const input = commentSchema.parse(request.body);
  const project = await projectByToken(token);
  const access = await authorizedViewer(request, project);
  if (!Boolean(project.annotation_enabled)) {
    const error = new Error("该分享未开启协作批注");
    Object.assign(error, { status: 403 });
    throw error;
  }
  if (input.fileId) {
    const file = (await database().query(
      "SELECT id FROM lite_files WHERE id = $1 AND publication_id = $2",
      [input.fileId, String(project.publication_id)]
    )) as Row[];
    if (!file[0]) {
      const error = new Error("批注文件不在共享范围内");
      Object.assign(error, { status: 400 });
      throw error;
    }
  }
  if (input.parentId) {
    const parent = (await database().query(
      "SELECT id FROM lite_annotations WHERE id = $1 AND publication_id = $2",
      [input.parentId, String(project.publication_id)]
    )) as Row[];
    if (!parent[0]) {
      const error = new Error("回复的批注不存在");
      Object.assign(error, { status: 400 });
      throw error;
    }
  }
  const revisionRows = (await database().query(
    `UPDATE lite_projects SET annotation_revision = annotation_revision + 1,
       updated_at = NOW() WHERE publication_id = $1 RETURNING annotation_revision`,
    [String(project.publication_id)]
  )) as Row[];
  const revision = Number(revisionRows[0].annotation_revision);
  const id = crypto.randomUUID();
  const rows = (await database().query(
    `INSERT INTO lite_annotations(
       id, publication_id, file_id, field_key, page_number, parent_id,
       author_name, author_email, body, status, revision
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10)
     RETURNING *`,
    [
      id,
      String(project.publication_id),
      input.fileId ?? null,
      input.fieldKey ?? null,
      input.pageNumber ?? null,
      input.parentId ?? null,
      access.viewer?.name ?? input.authorName,
      access.viewer?.email ?? input.authorEmail ?? null,
      input.body,
      revision,
    ]
  )) as Row[];
  response.status(201).json(annotation(rows[0]));
}

async function resolveComment(
  request: VercelRequest,
  response: VercelResponse
) {
  requireSameOrigin(request);
  const token = tokenSchema.parse(value(request.query.token));
  const input = z
    .object({ annotationId: z.string().uuid(), resolved: z.boolean() })
    .parse(request.body);
  const project = await projectByToken(token);
  await authorizedViewer(request, project);
  const existing = (await database().query(
    "SELECT id FROM lite_annotations WHERE id = $1 AND publication_id = $2",
    [input.annotationId, String(project.publication_id)]
  )) as Row[];
  if (!existing[0]) {
    const error = new Error("批注不存在");
    Object.assign(error, { status: 404 });
    throw error;
  }
  const revisionRows = (await database().query(
    `UPDATE lite_projects SET annotation_revision = annotation_revision + 1,
       updated_at = NOW() WHERE publication_id = $1 RETURNING annotation_revision`,
    [String(project.publication_id)]
  )) as Row[];
  const revision = Number(revisionRows[0].annotation_revision);
  const rows = (await database().query(
    `UPDATE lite_annotations SET status = $1, revision = $2, updated_at = NOW()
     WHERE id = $3 AND publication_id = $4 RETURNING *`,
    [
      input.resolved ? "resolved" : "open",
      revision,
      input.annotationId,
      String(project.publication_id),
    ]
  )) as Row[];
  if (!rows[0]) {
    const error = new Error("批注不存在");
    Object.assign(error, { status: 404 });
    throw error;
  }
  response.status(200).json(annotation(rows[0]));
}

async function sourceFile(request: VercelRequest, response: VercelResponse) {
  const token = tokenSchema.parse(value(request.query.token));
  const fileId = idSchema.parse(value(request.query.fileId));
  const project = await projectByToken(token);
  await authorizedViewer(request, project);
  const rows = (await database().query(
    "SELECT * FROM lite_files WHERE id = $1 AND publication_id = $2 LIMIT 1",
    [fileId, String(project.publication_id)]
  )) as Row[];
  const file = rows[0];
  if (!file) {
    const error = new Error("共享文件不存在");
    Object.assign(error, { status: 404 });
    throw error;
  }
  const blob = await get(String(file.blob_url), { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    const error = new Error("共享文件存储不可用");
    Object.assign(error, { status: 404 });
    throw error;
  }
  const fileName = String(file.original_name).replace(/[\r\n"]/gu, "_");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Content-Type", String(file.mime_type));
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Download-Options", "noopen");
  response.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  Readable.fromWeb(blob.stream as never).pipe(response);
}

async function syncProject(request: VercelRequest, response: VercelResponse) {
  requireSyncToken(request);
  const payload = request.body as LiteSyncPayload;
  if (
    !payload?.publicationId ||
    !payload.shareToken ||
    !payload.localProjectId ||
    !Array.isArray(payload.files) ||
    !Array.isArray(payload.members)
  )
    throw Object.assign(new Error("同步数据不完整"), { status: 400 });
  const accessMode: ShareAccessMode =
    payload.accessMode ?? (payload.members.length ? "member_email" : "open");
  const accessCodeHash = payload.accessCodeHash ?? null;
  if (accessMode === "passcode" && !accessCodeHash)
    throw Object.assign(new Error("访问码分享缺少安全哈希"), { status: 400 });
  if (
    accessMode === "passcode" &&
    accessCodeHash &&
    !isShareAccessCodeHash(accessCodeHash)
  )
    throw Object.assign(new Error("访问码安全哈希格式无效"), { status: 400 });
  if (accessMode !== "passcode" && accessCodeHash)
    throw Object.assign(new Error("非访问码分享不能携带访问码哈希"), {
      status: 400,
    });
  if (accessMode === "passcode" && payload.members.length)
    throw Object.assign(new Error("访问码分享不能同时配置邮箱成员"), {
      status: 400,
    });
  if (accessMode === "member_email" && !payload.members.length)
    throw Object.assign(new Error("邮箱成员访问模式缺少成员"), {
      status: 400,
    });
  if (accessMode === "open" && payload.members.length)
    throw Object.assign(new Error("公开链接模式不能携带邮箱成员"), {
      status: 400,
    });
  const uploaded: Array<{
    id: string;
    sourceFileId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    pageCount: number;
    sha256: string;
    blobUrl: string;
  }> = [];
  for (const file of payload.files) {
    const safeName = file.originalName.replace(/[^\p{L}\p{N}._-]+/gu, "_");
    const blob = await put(
      `cofound/${payload.publicationId}/${file.sha256}-${safeName}`,
      Buffer.from(file.contentBase64, "base64"),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: file.mimeType,
        cacheControlMaxAge: 60,
      }
    );
    uploaded.push({
      id: `${payload.publicationId}_${file.id}`,
      sourceFileId: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      pageCount: file.pageCount,
      sha256: file.sha256,
      blobUrl: blob.url,
    });
  }
  const sql = database();
  await sql.query(
    `INSERT INTO lite_projects(
       publication_id, local_project_id, share_token, project_name, snapshot_json,
       remote_version, annotation_enabled, download_enabled, access_mode,
       access_code_hash, active, updated_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,FALSE,$8,$9,TRUE,NOW())
     ON CONFLICT(publication_id) DO UPDATE SET
       local_project_id = EXCLUDED.local_project_id,
       share_token = EXCLUDED.share_token,
       project_name = EXCLUDED.project_name,
       snapshot_json = EXCLUDED.snapshot_json,
       remote_version = EXCLUDED.remote_version,
       annotation_enabled = EXCLUDED.annotation_enabled,
       download_enabled = FALSE,
       access_mode = EXCLUDED.access_mode,
       access_code_hash = EXCLUDED.access_code_hash,
       active = TRUE,
       updated_at = NOW()`,
    [
      payload.publicationId,
      payload.localProjectId,
      payload.shareToken,
      payload.project.name,
      JSON.stringify(payload.project),
      payload.remoteVersion,
      payload.annotationEnabled,
      accessMode,
      accessCodeHash,
    ]
  );
  for (const file of uploaded)
    await sql.query(
      `INSERT INTO lite_files(
         id, publication_id, source_file_id, original_name, mime_type,
         size_bytes, page_count, sha256, blob_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET
         original_name = EXCLUDED.original_name,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         page_count = EXCLUDED.page_count,
         sha256 = EXCLUDED.sha256,
         blob_url = EXCLUDED.blob_url,
         updated_at = NOW()`,
      [
        file.id,
        payload.publicationId,
        file.sourceFileId,
        file.originalName,
        file.mimeType,
        file.sizeBytes,
        file.pageCount,
        file.sha256,
        file.blobUrl,
      ]
    );
  if (uploaded.length)
    await sql.query(
      "DELETE FROM lite_files WHERE publication_id = $1 AND NOT (id = ANY($2::text[]))",
      [payload.publicationId, uploaded.map(file => file.id)]
    );
  else
    await sql.query("DELETE FROM lite_files WHERE publication_id = $1", [
      payload.publicationId,
    ]);
  for (const member of payload.members)
    await sql.query(
      `INSERT INTO lite_members(publication_id, email, name, role, updated_at)
       VALUES ($1,LOWER($2),$3,$4,NOW())
       ON CONFLICT(publication_id, email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         updated_at = NOW()`,
      [payload.publicationId, member.email, member.name, member.role]
    );
  if (payload.members.length)
    await sql.query(
      "DELETE FROM lite_members WHERE publication_id = $1 AND NOT (email = ANY($2::text[]))",
      [
        payload.publicationId,
        payload.members.map(member => member.email.toLocaleLowerCase()),
      ]
    );
  else
    await sql.query("DELETE FROM lite_members WHERE publication_id = $1", [
      payload.publicationId,
    ]);
  const shareUrl = `${publicBaseUrl(request)}/share/${payload.shareToken}`;
  response.status(200).json({
    ok: true,
    shareUrl,
    remoteVersion: payload.remoteVersion,
    files: uploaded.length,
    members: payload.members.length,
  });
}

async function setPublicationState(
  request: VercelRequest,
  response: VercelResponse
) {
  requireSyncToken(request);
  const input = z
    .object({ publicationId: z.string().min(3).max(200), active: z.boolean() })
    .parse(request.body);
  const rows = (await database().query(
    "UPDATE lite_projects SET active = $1, updated_at = NOW() WHERE publication_id = $2 RETURNING publication_id",
    [input.active, input.publicationId]
  )) as Row[];
  if (!rows[0])
    throw Object.assign(new Error("远端共享项目不存在"), { status: 404 });
  response.status(200).json({ ok: true, active: input.active });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  try {
    const action = value(request.query.action) || "health";
    if (request.method === "GET" && action === "health") {
      response.status(200).json({
        ok: true,
        runtime: "vercel-lite",
        database: Boolean(process.env.DATABASE_URL),
        blob: Boolean(
          process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID
        ),
        emailOtp: Boolean(supabase()),
      });
      return;
    }
    if (request.method === "GET" && action === "auth-status")
      return await authStatus(request, response);
    if (request.method === "POST" && action === "otp-request")
      return await requestEmailOtp(request, response);
    if (request.method === "POST" && action === "otp-verify")
      return await verifyEmailOtp(request, response);
    if (request.method === "POST" && action === "passcode-verify")
      return await verifyPasscode(request, response);
    if (request.method === "GET" && action === "admin-annotations")
      return await adminAnnotations(request, response);
    if (request.method === "GET" && action === "share")
      return await share(request, response);
    if (request.method === "GET" && action === "comments")
      return await listComments(request, response);
    if (request.method === "GET" && action === "file")
      return await sourceFile(request, response);
    if (request.method === "POST" && action === "comment")
      return await createComment(request, response);
    if (request.method === "POST" && action === "resolve")
      return await resolveComment(request, response);
    if (request.method === "POST" && action === "sync")
      return await syncProject(request, response);
    if (request.method === "POST" && action === "publication-state")
      return await setPublicationState(request, response);
    response.status(404).json({ error: "接口不存在" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      response
        .status(400)
        .json({ error: "输入不符合要求", detail: error.issues });
      return;
    }
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: unknown }).status)
        : 500;
    console.error("[Vercel Lite]", error);
    response.status(status).json({
      error: error instanceof Error ? error.message : "服务器处理失败",
    });
  }
}
