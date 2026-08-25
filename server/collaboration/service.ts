import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import { parse } from "cookie";
import type {
  AnnotationInbox,
  AuditEvent,
  CollaborationOverview,
  DownloadRequest,
  LinkShareProject,
  LiteSyncPayload,
  PortalProject,
  PublicationAnnotationSnapshot,
  PublicationDetail,
  PublicationMember,
  PublicationSummary,
  SecurityMode,
  SessionUser,
  ShareAccessMode,
  ShareAnnotation,
  SyncJob,
  UserRole,
  VerificationResult,
  VerificationState,
} from "../../shared/collaboration";
import type {
  AnalysisPayload,
  ProjectDetail,
  ShareMode,
} from "../../shared/bp";
import { getDatabase } from "../local/database";
import { getOperationLedger } from "../local/operation-ledger";
import { remoteFetch } from "./remote-fetch";
import { AuthError, collaborationAuth, hashToken, randomToken } from "./auth";
import { privateObjectStorage } from "./storage";
import { projectFieldMetadata } from "../../shared/field-metadata";
import {
  createShareAccessSession,
  hashShareAccessCode,
  SHARE_ACCESS_COOKIE,
  verifyShareAccessCode,
  verifyShareAccessSession,
} from "./access-code";

type Row = Record<string, unknown>;
type SnapshotPayload = {
  project: Pick<
    ProjectDetail,
    | "id"
    | "name"
    | "product"
    | "industry"
    | "fundingRound"
    | "managementStatus"
    | "description"
    | "localVersion"
  >;
  fields: Array<{
    key: string;
    label: string;
    englishLabel: string;
    value: unknown;
    evidence: { page: number | null; quote: string | null } | null;
  }>;
  analysis: Pick<
    AnalysisPayload,
    "summary" | "risks" | "missingInformation" | "commercialChecks"
  > | null;
  files: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    pageCount: number;
  }>;
  publishedAt: string;
};

const now = () => new Date().toISOString();
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

function requestIp(request?: Request) {
  return request?.ip || request?.socket.remoteAddress || null;
}

function publicationAccessMode(row: Row): ShareAccessMode {
  const value = row.access_mode;
  return value === "passcode" || value === "member_email" ? value : "open";
}

function toJob(row: Row): SyncJob {
  return {
    id: String(row.id),
    kind: String(row.kind) as SyncJob["kind"],
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    publicationId:
      typeof row.publication_id === "string" ? row.publication_id : null,
    state: String(row.state) as SyncJob["state"],
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    error: typeof row.error === "string" ? row.error : null,
    createdAt: String(row.created_at),
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

function toPublicationSummary(row: Row): PublicationSummary {
  const shareToken = String(row.share_token ?? "");
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    projectName: String(row.project_name ?? row.name ?? "未命名项目"),
    state: String(row.state) as PublicationSummary["state"],
    shareMode: String(row.share_mode) as ShareMode,
    securityMode: String(row.security_mode) as SecurityMode,
    localVersion: Number(row.local_version),
    remoteVersion: Number(row.remote_version),
    syncState: String(row.sync_state) as PublicationSummary["syncState"],
    selectedFieldCount: Number(row.selected_field_count ?? 0),
    selectedFileCount: Number(row.selected_file_count ?? 0),
    memberCount: Number(row.member_count ?? 0),
    accessMode: publicationAccessMode(row),
    accessCodeConfigured: Boolean(row.access_code_hash),
    configuredByName:
      typeof row.configured_by_name === "string"
        ? row.configured_by_name
        : null,
    configuredByEmail:
      typeof row.configured_by_email === "string"
        ? row.configured_by_email
        : null,
    configuredAt:
      typeof row.configured_at === "string" ? row.configured_at : null,
    shareToken,
    shareUrl: shareToken ? `/share/${shareToken}` : "",
    remoteShareUrl:
      typeof row.remote_share_url === "string" ? row.remote_share_url : null,
    annotationEnabled: Boolean(row.annotation_enabled),
    downloadEnabled: Boolean(row.download_enabled),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    updatedAt: String(row.updated_at),
  };
}

function toAudit(row: Row): AuditEvent {
  return {
    id: Number(row.id),
    actorName: typeof row.actor_name === "string" ? row.actor_name : null,
    actorEmail: typeof row.actor_email === "string" ? row.actor_email : null,
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: typeof row.target_id === "string" ? row.target_id : null,
    detail: parseJson<Record<string, unknown>>(row.detail_json, {}),
    ip: typeof row.ip === "string" ? row.ip : null,
    createdAt: String(row.created_at),
  };
}

export class CollaborationService {
  private get connection() {
    return getDatabase().connection;
  }

  audit(
    actor: SessionUser | null,
    action: string,
    targetType: string,
    targetId: string | null,
    detail: Record<string, unknown> = {},
    request?: Request
  ) {
    this.connection
      .prepare(
        `
      INSERT INTO audit_events(actor_id, action, target_type, target_id, detail_json, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        actor?.id ?? null,
        action,
        targetType,
        targetId,
        JSON.stringify(detail),
        requestIp(request),
        now()
      );
  }

  listAudit(limit = 100) {
    return this.connection
      .prepare(
        `
      SELECT a.*, u.name AS actor_name, u.email AS actor_email
      FROM audit_events a LEFT JOIN collaboration_users u ON u.id = a.actor_id
      ORDER BY a.id DESC LIMIT ?
    `
      )
      .all(Math.min(Math.max(limit, 1), 500))
      .map(row => toAudit(row as Row));
  }

  private publicationRows() {
    return this.connection
      .prepare(
        `
      SELECT p.*, pr.name AS project_name,
        (SELECT COUNT(*) FROM publication_fields pf WHERE pf.publication_id = p.id) AS selected_field_count,
        (SELECT COUNT(*) FROM publication_files pfi WHERE pfi.publication_id = p.id) AS selected_file_count,
        (SELECT COUNT(*) FROM publication_members pm WHERE pm.publication_id = p.id) AS member_count,
        COALESCE(
          (SELECT u.name FROM audit_events a JOIN collaboration_users u ON u.id = a.actor_id
           WHERE a.action = 'publication.configured' AND a.target_id = p.id ORDER BY a.id DESC LIMIT 1),
          creator.name
        ) AS configured_by_name,
        COALESCE(
          (SELECT u.email FROM audit_events a JOIN collaboration_users u ON u.id = a.actor_id
           WHERE a.action = 'publication.configured' AND a.target_id = p.id ORDER BY a.id DESC LIMIT 1),
          creator.email
        ) AS configured_by_email,
        COALESCE(
          (SELECT a.created_at FROM audit_events a
           WHERE a.action = 'publication.configured' AND a.target_id = p.id ORDER BY a.id DESC LIMIT 1),
          p.created_at
        ) AS configured_at
      FROM publications p JOIN projects pr ON pr.id = p.project_id
      LEFT JOIN collaboration_users creator ON creator.id = p.created_by
      ORDER BY p.updated_at DESC
    `
      )
      .all() as Row[];
  }

  listPublications() {
    this.expirePublications();
    return this.publicationRows().map(toPublicationSummary);
  }

  async getPublicationAnnotations(publicationId: string) {
    const publication = this.getPublication(publicationId);
    if (!publication) throw new AuthError("共享项目不存在", 404);
    const remoteUrl = process.env.COF_BP_LITE_REMOTE_URL?.replace(/\/$/u, "");
    const syncToken = process.env.COF_BP_LITE_SYNC_TOKEN;
    if (!remoteUrl || !syncToken)
      throw new AuthError("Vercel Lite 批注回流尚未配置", 503);

    const response = await remoteFetch(
      `${remoteUrl}/api/lite?action=admin-annotations&publicationId=${encodeURIComponent(publicationId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${syncToken}` },
      }
    );
    const result = (await response.json().catch(() => ({}))) as Partial<
      PublicationAnnotationSnapshot & { error: string }
    >;
    if (!response.ok)
      throw new AuthError(
        result.error || `远端批注读取失败（${response.status}）`,
        response.status === 404 ? 404 : 502
      );
    if (
      result.publicationId !== publicationId ||
      !Array.isArray(result.annotations) ||
      typeof result.revision !== "number"
    )
      throw new AuthError("远端批注响应不符合当前同步协议", 502);
    return result as PublicationAnnotationSnapshot;
  }

  async getAnnotationInbox(): Promise<AnnotationInbox> {
    const publications = this.listPublications().filter(
      publication => publication.remoteVersion > 0
    );
    const settled = await Promise.allSettled(
      publications.map(publication =>
        this.getPublicationAnnotations(publication.id)
      )
    );
    const snapshots: PublicationAnnotationSnapshot[] = [];
    const errors: AnnotationInbox["errors"] = [];
    settled.forEach((result, index) => {
      const publication = publications[index];
      if (result.status === "fulfilled") snapshots.push(result.value);
      else
        errors.push({
          publicationId: publication.id,
          projectName: publication.projectName,
          message:
            result.reason instanceof Error
              ? result.reason.message
              : "远端批注读取失败",
        });
    });
    return {
      publications: snapshots,
      errors,
      fetchedAt: now(),
    };
  }

  getOverview(): CollaborationOverview {
    const publications = this.listPublications();
    const pendingApprovals = Number(
      (
        this.connection
          .prepare(
            "SELECT COUNT(*) AS count FROM download_requests WHERE state = 'pending'"
          )
          .get() as Row
      ).count
    );
    const activeMembers = Number(
      (
        this.connection
          .prepare(
            "SELECT COUNT(*) AS count FROM collaboration_users WHERE state = 'active'"
          )
          .get() as Row
      ).count
    );
    const failedJobs = Number(
      (
        this.connection
          .prepare(
            "SELECT COUNT(*) AS count FROM collaboration_jobs WHERE state IN ('failed','conflict')"
          )
          .get() as Row
      ).count
    );
    return {
      publications,
      pendingApprovals,
      activeMembers,
      failedJobs,
      recentAudit: this.listAudit(8),
    };
  }

  getPublication(id: string): PublicationDetail | null {
    this.expirePublications();
    const base = this.connection
      .prepare(
        `
      SELECT p.*, pr.name AS project_name,
        (SELECT COUNT(*) FROM publication_fields pf WHERE pf.publication_id = p.id) AS selected_field_count,
        (SELECT COUNT(*) FROM publication_files pfi WHERE pfi.publication_id = p.id) AS selected_file_count,
        (SELECT COUNT(*) FROM publication_members pm WHERE pm.publication_id = p.id) AS member_count,
        COALESCE(
          (SELECT u.name FROM audit_events a JOIN collaboration_users u ON u.id = a.actor_id
           WHERE a.action = 'publication.configured' AND a.target_id = p.id ORDER BY a.id DESC LIMIT 1),
          creator.name
        ) AS configured_by_name,
        COALESCE(
          (SELECT u.email FROM audit_events a JOIN collaboration_users u ON u.id = a.actor_id
           WHERE a.action = 'publication.configured' AND a.target_id = p.id ORDER BY a.id DESC LIMIT 1),
          creator.email
        ) AS configured_by_email,
        COALESCE(
          (SELECT a.created_at FROM audit_events a
           WHERE a.action = 'publication.configured' AND a.target_id = p.id ORDER BY a.id DESC LIMIT 1),
          p.created_at
        ) AS configured_at
      FROM publications p JOIN projects pr ON pr.id = p.project_id
      LEFT JOIN collaboration_users creator ON creator.id = p.created_by
      WHERE p.id = ?
    `
      )
      .get(id) as Row | undefined;
    if (!base) return null;
    const selectedFields = this.connection
      .prepare(
        "SELECT field_key FROM publication_fields WHERE publication_id = ? ORDER BY field_key"
      )
      .all(id)
      .map(row => String((row as Row).field_key));
    const selectedFileIds = this.connection
      .prepare(
        "SELECT file_id FROM publication_files WHERE publication_id = ? ORDER BY file_id"
      )
      .all(id)
      .map(row => String((row as Row).file_id));
    const members = this.connection
      .prepare(
        `
      SELECT u.id AS user_id, u.email, u.name, u.role, pm.can_view_fields, pm.can_view_files, pm.can_request_download
      FROM publication_members pm JOIN collaboration_users u ON u.id = pm.user_id
      WHERE pm.publication_id = ? ORDER BY u.name
    `
      )
      .all(id)
      .map(value => {
        const row = value as Row;
        return {
          userId: String(row.user_id),
          email: String(row.email),
          name: String(row.name),
          role: String(row.role),
          canViewFields: Boolean(row.can_view_fields),
          canViewFiles: Boolean(row.can_view_files),
          canRequestDownload: Boolean(row.can_request_download),
        } as PublicationMember;
      });
    const verification = this.connection
      .prepare(
        "SELECT * FROM verification_results WHERE publication_id = ? ORDER BY field_key"
      )
      .all(id)
      .map(value => {
        const row = value as Row;
        return {
          fieldKey: String(row.field_key),
          state: String(row.state),
          detail: String(row.detail),
          evidencePage:
            typeof row.evidence_page === "number" ? row.evidence_page : null,
          checkedAt: String(row.checked_at),
        } as VerificationResult;
      });
    const latestJobRow = this.connection
      .prepare(
        "SELECT * FROM collaboration_jobs WHERE publication_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(id) as Row | undefined;
    return {
      ...toPublicationSummary(base),
      selectedFields,
      selectedFileIds,
      members,
      verification,
      latestJob: latestJobRow ? toJob(latestJobRow) : null,
    };
  }

  configurePublication(input: {
    projectId: string;
    shareMode: Exclude<ShareMode, "local_only">;
    securityMode: SecurityMode;
    accessMode?: ShareAccessMode;
    accessCode?: string;
    selectedFields: string[];
    selectedFileIds: string[];
    expiresAt: string | null;
    annotationEnabled?: boolean;
    members: Array<{
      userId: string;
      canViewFields: boolean;
      canViewFiles: boolean;
      canRequestDownload: boolean;
    }>;
    actor: SessionUser;
    request?: Request;
  }) {
    const ledger = getOperationLedger();
    const configureOperation = ledger.start({
      operationType: "external_share",
      projectId: input.projectId,
      actor: {
        kind: "human",
        id: input.actor.id,
        name: input.actor.name,
      },
      metadata: {
        phase: "configuration",
        shareMode: input.shareMode,
        securityMode: input.securityMode,
        accessMode:
          input.accessMode ?? (input.members.length ? "member_email" : "open"),
        selectedFieldCount: input.selectedFields.length,
        selectedFileCount: input.selectedFileIds.length,
        memberCount: input.members.length,
        annotationEnabled: input.annotationEnabled !== false,
      },
    });
    try {
      const project = getDatabase().getProject(input.projectId);
      if (!project) throw new AuthError("项目不存在", 404);
      if (getDatabase().isProjectArchived(input.projectId))
        throw new AuthError("项目位于回收站，请先恢复后再配置外部分享", 400);
      if (input.shareMode === "fields_only" && input.selectedFileIds.length)
        throw new AuthError("仅共享字段时不能选择文件", 400);
      if (input.shareMode === "selected_files" && !input.selectedFileIds.length)
        throw new AuthError("共享指定文件时至少选择一个文件", 400);
      if (!input.selectedFields.length)
        throw new AuthError("至少选择一个共享字段", 400);
      const allowedFields = new Set(project.fields.map(field => field.key));
      const selectedFields = [...new Set(input.selectedFields)].filter(field =>
        allowedFields.has(field)
      );
      if (!selectedFields.length)
        throw new AuthError("所选字段不属于当前项目", 400);
      const allowedFiles = new Set(project.files.map(file => file.id));
      const selectedFileIds = [...new Set(input.selectedFileIds)].filter(
        fileId => allowedFiles.has(fileId)
      );
      if (selectedFileIds.length !== new Set(input.selectedFileIds).size)
        throw new AuthError("包含不属于当前项目的文件", 400);
      const publicationId = String(
        (
          this.connection
            .prepare("SELECT id FROM publications WHERE project_id = ?")
            .get(input.projectId) as Row | undefined
        )?.id ?? crypto.randomUUID()
      );
      const existingPublication = this.connection
        .prepare(
          "SELECT share_token, access_mode, access_code_hash FROM publications WHERE id = ?"
        )
        .get(publicationId) as Row | undefined;
      const shareToken =
        typeof existingPublication?.share_token === "string" &&
        existingPublication.share_token
          ? existingPublication.share_token
          : crypto.randomBytes(24).toString("base64url");
      const accessMode: ShareAccessMode =
        input.accessMode ?? (input.members.length ? "member_email" : "open");
      if (accessMode === "member_email" && !input.members.length)
        throw new AuthError("邮箱成员访问模式至少需要一名协作者", 400);
      if (accessMode === "open" && input.members.length)
        throw new AuthError("公开链接模式不能同时配置邮箱成员", 400);
      if (accessMode === "passcode" && input.members.length)
        throw new AuthError("访问码分享不需要添加邮箱成员", 400);
      let accessCodeHash: string | null = null;
      if (accessMode === "passcode") {
        if (input.accessCode)
          accessCodeHash = hashShareAccessCode(input.accessCode);
        else if (
          publicationAccessMode(existingPublication ?? {}) === "passcode" &&
          typeof existingPublication?.access_code_hash === "string"
        )
          accessCodeHash = existingPublication.access_code_hash;
        else throw new AuthError("访问码分享必须设置 6 位数字访问码", 400);
      }
      const updatedAt = now();
      getDatabase().transaction(() => {
        this.connection
          .prepare(
            `
        INSERT INTO publications(id, project_id, share_token, state, share_mode, security_mode, local_version, remote_version, sync_state, expires_at, annotation_enabled, download_enabled, access_mode, access_code_hash, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'draft', ?, ?, ?, 0, 'pending', ?, ?, 0, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          state = CASE WHEN publications.state = 'paused' THEN 'draft' ELSE publications.state END,
          share_mode = excluded.share_mode, security_mode = excluded.security_mode,
          local_version = excluded.local_version, sync_state = 'pending', expires_at = excluded.expires_at,
          annotation_enabled = excluded.annotation_enabled, download_enabled = 0,
          access_mode = excluded.access_mode, access_code_hash = excluded.access_code_hash,
          updated_at = excluded.updated_at
      `
          )
          .run(
            publicationId,
            input.projectId,
            shareToken,
            input.shareMode,
            input.securityMode,
            project.localVersion,
            input.expiresAt,
            input.annotationEnabled === false ? 0 : 1,
            accessMode,
            accessCodeHash,
            input.actor.id,
            updatedAt,
            updatedAt
          );
        this.connection
          .prepare("DELETE FROM publication_fields WHERE publication_id = ?")
          .run(publicationId);
        for (const key of selectedFields)
          this.connection
            .prepare(
              "INSERT INTO publication_fields(publication_id, field_key) VALUES (?, ?)"
            )
            .run(publicationId, key);
        this.connection
          .prepare("DELETE FROM publication_files WHERE publication_id = ?")
          .run(publicationId);
        for (const fileId of selectedFileIds)
          this.connection
            .prepare(
              "INSERT INTO publication_files(publication_id, file_id) VALUES (?, ?)"
            )
            .run(publicationId, fileId);
        this.connection
          .prepare("DELETE FROM publication_members WHERE publication_id = ?")
          .run(publicationId);
        for (const member of input.members) {
          const active = this.connection
            .prepare(
              "SELECT id FROM collaboration_users WHERE id = ? AND state = 'active'"
            )
            .get(member.userId);
          if (!active) throw new AuthError("协作者账号不存在或未激活", 400);
          this.connection
            .prepare(
              `
          INSERT INTO publication_members(publication_id, user_id, can_view_fields, can_view_files, can_request_download, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
            )
            .run(
              publicationId,
              member.userId,
              member.canViewFields ? 1 : 0,
              member.canViewFiles ? 1 : 0,
              member.canRequestDownload ? 1 : 0,
              updatedAt
            );
        }
        this.connection
          .prepare(
            "UPDATE projects SET share_mode = ?, sync_state = 'pending', updated_at = ? WHERE id = ?"
          )
          .run(input.shareMode, updatedAt, input.projectId);
        this.enqueue("publish", input.projectId, publicationId, {
          configuredBy: input.actor.id,
        });
      });
      this.audit(
        input.actor,
        "publication.configured",
        "publication",
        publicationId,
        {
          shareMode: input.shareMode,
          securityMode: input.securityMode,
          fields: selectedFields.length,
          files: selectedFileIds.length,
          members: input.members.length,
          accessMode,
          accessCodeChanged: Boolean(input.accessCode),
        },
        input.request
      );
      const result = this.getPublication(publicationId)!;
      ledger.succeed(configureOperation.operationId, {
        publicationId,
        configurationAction: existingPublication ? "updated" : "created",
        queueState: "pending",
      });
      return result;
    } catch (error) {
      if (
        ledger.getOperation(configureOperation.operationId)?.summary.status ===
        "started"
      )
        ledger.fail(configureOperation.operationId, {
          code: "EXTERNAL_SHARE_CONFIGURATION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
  }

  async pausePublication(id: string, actor: SessionUser, request?: Request) {
    const result = this.connection
      .prepare(
        "UPDATE publications SET state = 'paused', updated_at = ? WHERE id = ?"
      )
      .run(now(), id);
    if (!result.changes) throw new AuthError("共享项目不存在", 404);
    await this.setRemotePublicationActive(id, false);
    this.audit(actor, "publication.paused", "publication", id, {}, request);
    return this.getPublication(id)!;
  }

  syncPublication(id: string, actor: SessionUser, request?: Request) {
    const row = this.connection
      .prepare("SELECT project_id FROM publications WHERE id = ?")
      .get(id) as Row | undefined;
    if (!row) throw new AuthError("共享项目不存在", 404);
    this.connection
      .prepare(
        "UPDATE publications SET sync_state = 'pending', state = 'draft', updated_at = ? WHERE id = ?"
      )
      .run(now(), id);
    const job = this.enqueue("sync", String(row.project_id), id, {
      requestedBy: actor.id,
    });
    this.audit(
      actor,
      "publication.sync_requested",
      "publication",
      id,
      { jobId: job.id },
      request
    );
    return job;
  }

  enqueue(
    kind: SyncJob["kind"],
    projectId: string | null,
    publicationId: string | null,
    payload: Record<string, unknown>
  ) {
    const id = crypto.randomUUID();
    const createdAt = now();
    this.connection
      .prepare(
        `
      INSERT INTO collaboration_jobs(id, kind, project_id, publication_id, payload_json, state, attempts, max_attempts, available_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, 3, ?, ?)
    `
      )
      .run(
        id,
        kind,
        projectId,
        publicationId,
        JSON.stringify(payload),
        createdAt,
        createdAt
      );
    return toJob(
      this.connection
        .prepare("SELECT * FROM collaboration_jobs WHERE id = ?")
        .get(id) as Row
    );
  }

  listJobs(limit = 100) {
    return this.connection
      .prepare(
        "SELECT * FROM collaboration_jobs ORDER BY created_at DESC LIMIT ?"
      )
      .all(Math.min(limit, 500))
      .map(row => toJob(row as Row));
  }

  retryJob(id: string, actor: SessionUser, request?: Request) {
    const updatedAt = now();
    const result = this.connection
      .prepare(
        `
      UPDATE collaboration_jobs SET state = 'pending', error = NULL, available_at = ?, started_at = NULL, completed_at = NULL
      WHERE id = ? AND state IN ('failed','conflict')
    `
      )
      .run(updatedAt, id);
    if (!result.changes) throw new AuthError("任务不存在或当前无需重试", 409);
    this.audit(actor, "job.retried", "job", id, {}, request);
    return toJob(
      this.connection
        .prepare("SELECT * FROM collaboration_jobs WHERE id = ?")
        .get(id) as Row
    );
  }

  claimNextJob() {
    const current = now();
    const row = this.connection
      .prepare(
        `
      SELECT * FROM collaboration_jobs WHERE state = 'pending' AND available_at <= ? ORDER BY created_at LIMIT 1
    `
      )
      .get(current) as Row | undefined;
    if (!row) return null;
    const result = this.connection
      .prepare(
        `
      UPDATE collaboration_jobs SET state = 'running', attempts = attempts + 1, started_at = ? WHERE id = ? AND state = 'pending'
    `
      )
      .run(current, String(row.id));
    if (!result.changes) return null;
    return toJob(
      this.connection
        .prepare("SELECT * FROM collaboration_jobs WHERE id = ?")
        .get(String(row.id)) as Row
    );
  }

  async processJob(job: SyncJob) {
    let externalShareOperation: string | null = null;
    try {
      externalShareOperation =
        job.kind === "publish" || job.kind === "sync"
          ? this.startExternalShareJobOperation(job)
          : null;
      if (job.kind === "publish" || job.kind === "sync")
        await this.publishSnapshot(job);
      else if (job.kind === "verify")
        this.verifyPublication(job.publicationId!);
      else if (job.kind === "watermarked_download") {
        // The per-viewer document is rendered only after an approved user opens the short-lived link.
      }
      this.connection
        .prepare(
          "UPDATE collaboration_jobs SET state = 'succeeded', completed_at = ?, error = NULL WHERE id = ?"
        )
        .run(now(), job.id);
      if (externalShareOperation) {
        const publication = job.publicationId
          ? (this.connection
              .prepare(
                "SELECT remote_version, sync_state FROM publications WHERE id = ?"
              )
              .get(job.publicationId) as Row | undefined)
          : undefined;
        getOperationLedger().succeed(externalShareOperation, {
          publicationId: job.publicationId,
          jobId: job.id,
          remoteVersion: Number(publication?.remote_version ?? 0),
          syncState: String(publication?.sync_state ?? "unknown"),
          remoteDeliveryConfigured: Boolean(
            process.env.COF_BP_LITE_REMOTE_URL &&
              process.env.COF_BP_LITE_SYNC_TOKEN
          ),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const current = this.connection
        .prepare(
          "SELECT attempts, max_attempts FROM collaboration_jobs WHERE id = ?"
        )
        .get(job.id) as Row;
      const retry = Number(current.attempts) < Number(current.max_attempts);
      const state = message.startsWith("SYNC_CONFLICT:")
        ? "conflict"
        : retry
          ? "pending"
          : "failed";
      const delay = new Date(
        Date.now() + Math.max(1, Number(current.attempts)) * 2000
      ).toISOString();
      this.connection
        .prepare(
          `
        UPDATE collaboration_jobs SET state = ?, error = ?, available_at = ?, completed_at = ? WHERE id = ?
      `
        )
        .run(state, message, delay, state === "pending" ? null : now(), job.id);
      if (job.publicationId)
        this.connection
          .prepare(
            "UPDATE publications SET sync_state = ?, updated_at = ? WHERE id = ?"
          )
          .run(
            state === "conflict" ? "conflict" : "error",
            now(),
            job.publicationId
          );
      if (externalShareOperation) {
        const operationError = {
          code:
            state === "conflict"
              ? "EXTERNAL_SHARE_CONFLICT"
              : "EXTERNAL_SHARE_SYNC_FAILED",
          message,
        };
        if (state === "pending")
          getOperationLedger().markPartial(
            externalShareOperation,
            operationError,
            {
              publicationId: job.publicationId,
              jobId: job.id,
              retryScheduled: true,
              nextAttempt: Number(current.attempts) + 1,
            }
          );
        else
          getOperationLedger().fail(externalShareOperation, operationError, {
            publicationId: job.publicationId,
            jobId: job.id,
            retryScheduled: false,
            terminalJobState: state,
          });
      }
      throw error;
    }
  }

  private startExternalShareJobOperation(job: SyncJob) {
    const operationId = `external_share_job_${job.id}_attempt_${job.attempts}`;
    const ledger = getOperationLedger();
    if (ledger.getOperation(operationId)) return operationId;
    const row = this.connection
      .prepare("SELECT payload_json FROM collaboration_jobs WHERE id = ?")
      .get(job.id) as Row | undefined;
    const payload = parseJson<Record<string, unknown>>(row?.payload_json, {});
    const actorId =
      typeof payload.requestedBy === "string"
        ? payload.requestedBy
        : typeof payload.configuredBy === "string"
          ? payload.configuredBy
          : null;
    const actor = actorId
      ? (this.connection
          .prepare("SELECT name FROM collaboration_users WHERE id = ?")
          .get(actorId) as Row | undefined)
      : undefined;
    ledger.start({
      operationId,
      operationType: "external_share",
      projectId: job.projectId,
      actor: actorId
        ? {
            kind: "human",
            id: actorId,
            name: typeof actor?.name === "string" ? actor.name : null,
          }
        : {
            kind: "system",
            id: "collaboration-worker",
            name: "Collaboration Worker",
          },
      metadata: {
        phase: "delivery",
        publicationId: job.publicationId,
        jobId: job.id,
        jobKind: job.kind,
        attempt: job.attempts,
      },
    });
    return operationId;
  }

  private async publishSnapshot(job: SyncJob) {
    if (!job.publicationId || !job.projectId)
      throw new Error("发布任务缺少项目信息");
    const publication = this.connection
      .prepare("SELECT * FROM publications WHERE id = ?")
      .get(job.publicationId) as Row | undefined;
    const project = getDatabase().getProject(job.projectId);
    if (!publication || !project) throw new Error("共享项目或本地项目不存在");
    if (String(publication.state) === "paused")
      throw new Error("共享项目已暂停");
    const selectedFields = new Set(
      this.connection
        .prepare(
          "SELECT field_key FROM publication_fields WHERE publication_id = ?"
        )
        .all(job.publicationId)
        .map(row => String((row as Row).field_key))
    );
    const fileRows = this.connection
      .prepare(
        `
      SELECT pf.*, pfi.file_id FROM publication_files pfi JOIN project_files pf ON pf.id = pfi.file_id
      WHERE pfi.publication_id = ? ORDER BY pf.version_number DESC
    `
      )
      .all(job.publicationId) as Row[];
    const publishedAt = now();
    const payload: SnapshotPayload = {
      project: {
        id: project.id,
        name: project.name,
        product: project.product,
        industry: project.industry,
        fundingRound: project.fundingRound,
        managementStatus: project.managementStatus,
        description: project.description,
        localVersion: project.localVersion,
      },
      fields: project.fields
        .filter(field => selectedFields.has(field.key))
        .map(field => {
          const custom = project.customFields.find(
            item => item.key === field.key
          );
          const display = projectFieldMetadata(field.key, custom);
          return {
            key: field.key,
            label: display.label,
            englishLabel: display.englishLabel,
            value: field.value,
            evidence: field.evidence,
          };
        }),
      analysis: project.analysis
        ? {
            summary: project.analysis.summary,
            risks: project.analysis.risks,
            missingInformation: project.analysis.missingInformation,
            commercialChecks: project.analysis.commercialChecks,
          }
        : null,
      files: fileRows.map(row => ({
        id: String(row.id),
        originalName: String(row.original_name),
        mimeType: String(row.mime_type),
        sizeBytes: Number(row.size_bytes),
        pageCount: Number(row.page_count),
      })),
      publishedAt,
    };
    const payloadJson = JSON.stringify(payload);
    const sourceHash = crypto
      .createHash("sha256")
      .update(payloadJson)
      .digest("hex");
    const remoteVersion = Number(publication.remote_version) + 1;
    for (const file of fileRows) {
      const sourcePath = getDatabase().resolveStoredFile(
        String(file.stored_path)
      );
      const objectKey = await privateObjectStorage.putFile(
        job.publicationId,
        String(file.id),
        sourcePath,
        String(file.original_name)
      );
      this.connection
        .prepare(
          "UPDATE publication_files SET object_key = ? WHERE publication_id = ? AND file_id = ?"
        )
        .run(objectKey, job.publicationId, String(file.id));
    }
    getDatabase().transaction(() => {
      this.connection
        .prepare(
          `
        INSERT INTO publication_snapshots(id, publication_id, remote_version, source_local_version, payload_json, source_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          crypto.randomUUID(),
          job.publicationId,
          remoteVersion,
          project.localVersion,
          payloadJson,
          sourceHash,
          publishedAt
        );
      this.connection
        .prepare(
          `
        UPDATE publications SET state = 'published', local_version = ?, remote_version = ?, sync_state = 'synced',
          published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?
      `
        )
        .run(
          project.localVersion,
          remoteVersion,
          publishedAt,
          publishedAt,
          job.publicationId
        );
      this.connection
        .prepare(
          `
        UPDATE projects SET share_mode = ?, sync_state = 'synced', remote_version = ?, updated_at = ? WHERE id = ?
      `
        )
        .run(
          String(publication.share_mode),
          remoteVersion,
          publishedAt,
          job.projectId
        );
      this.enqueue("verify", job.projectId, job.publicationId, {
        remoteVersion,
      });
    });
    this.audit(null, "publication.synced", "publication", job.publicationId, {
      localVersion: project.localVersion,
      remoteVersion,
      sourceHash,
    });
    await this.syncLiteRemote(job.publicationId);
  }

  private liteSyncPayload(publicationId: string): LiteSyncPayload {
    const publication = this.connection
      .prepare("SELECT * FROM publications WHERE id = ?")
      .get(publicationId) as Row | undefined;
    if (!publication) throw new Error("共享项目不存在");
    const shareToken = String(publication.share_token ?? "");
    if (!shareToken) throw new Error("共享项目缺少链接令牌");
    const portal = this.getPortalProject(
      {
        id: "lite-sync",
        email: "lite-sync@cofound.local",
        name: "Vercel Lite Sync",
        role: "admin",
        state: "active",
        languagePreference: "bilingual",
      },
      publicationId
    );
    const project: LiteSyncPayload["project"] = {
      ...portal,
      revision: Number(publication.annotation_revision ?? 0),
      annotationEnabled: Boolean(publication.annotation_enabled),
      downloadEnabled: false,
    };
    const fileRows = this.connection
      .prepare(
        `SELECT pf.* FROM publication_files pfi
         JOIN project_files pf ON pf.id = pfi.file_id
         WHERE pfi.publication_id = ? ORDER BY pf.version_number`
      )
      .all(publicationId) as Row[];
    const memberRows = this.connection
      .prepare(
        `SELECT u.email, u.name, u.role FROM publication_members pm
         JOIN collaboration_users u ON u.id = pm.user_id
         WHERE pm.publication_id = ? AND u.state = 'active'
         ORDER BY u.name`
      )
      .all(publicationId) as Row[];
    return {
      publicationId,
      shareToken,
      localProjectId: String(publication.project_id),
      remoteVersion: Number(publication.remote_version),
      annotationEnabled: Boolean(publication.annotation_enabled),
      downloadEnabled: false,
      accessMode: publicationAccessMode(publication),
      accessCodeHash:
        typeof publication.access_code_hash === "string"
          ? publication.access_code_hash
          : null,
      project,
      members: memberRows.map(row => ({
        email: String(row.email),
        name: String(row.name),
        role: String(row.role) as "internal" | "external",
      })),
      files: fileRows.map(row => {
        const absolutePath = getDatabase().resolveStoredFile(
          String(row.stored_path)
        );
        return {
          id: String(row.id),
          originalName: String(row.original_name),
          mimeType: String(row.mime_type),
          sizeBytes: Number(row.size_bytes),
          pageCount: Number(row.page_count),
          sha256: String(row.sha256),
          contentBase64: fs.readFileSync(absolutePath).toString("base64"),
        };
      }),
    };
  }

  private async syncLiteRemote(publicationId: string) {
    const remoteUrl = process.env.COF_BP_LITE_REMOTE_URL?.replace(/\/$/u, "");
    const syncToken = process.env.COF_BP_LITE_SYNC_TOKEN;
    if (!remoteUrl || !syncToken) return null;
    const response = await remoteFetch(`${remoteUrl}/api/lite?action=sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${syncToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.liteSyncPayload(publicationId)),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      shareUrl?: string;
    };
    if (!response.ok || !result.shareUrl)
      throw new Error(
        result.error || `Vercel Lite 同步失败（${response.status}）`
      );
    this.connection
      .prepare(
        "UPDATE publications SET remote_share_url = ?, updated_at = ? WHERE id = ?"
      )
      .run(result.shareUrl, now(), publicationId);
    this.audit(
      null,
      "publication.vercel_synced",
      "publication",
      publicationId,
      {
        shareUrl: result.shareUrl,
      }
    );
    return result;
  }

  private async setRemotePublicationActive(
    publicationId: string,
    active: boolean
  ) {
    const remoteUrl = process.env.COF_BP_LITE_REMOTE_URL?.replace(/\/$/u, "");
    const syncToken = process.env.COF_BP_LITE_SYNC_TOKEN;
    if (!remoteUrl || !syncToken) return;
    const response = await remoteFetch(
      `${remoteUrl}/api/lite?action=publication-state`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${syncToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ publicationId, active }),
      }
    );
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(result.error || "远端分享状态更新失败");
    }
  }

  private verifyPublication(publicationId: string) {
    const publication = this.connection
      .prepare("SELECT project_id FROM publications WHERE id = ?")
      .get(publicationId) as Row | undefined;
    if (!publication) throw new Error("共享项目不存在");
    const fields = this.connection
      .prepare(
        `
      SELECT pf.field_key, f.value_json, f.source, f.evidence_json
      FROM publication_fields pf LEFT JOIN project_fields f
        ON f.project_id = ? AND f.field_key = pf.field_key
      WHERE pf.publication_id = ?
    `
      )
      .all(String(publication.project_id), publicationId) as Row[];
    const checkedAt = now();
    getDatabase().transaction(() => {
      this.connection
        .prepare("DELETE FROM verification_results WHERE publication_id = ?")
        .run(publicationId);
      for (const field of fields) {
        const value = parseJson<unknown>(field.value_json, null);
        const evidence = parseJson<{
          page: number | null;
          quote: string | null;
        } | null>(field.evidence_json, null);
        let state: VerificationState = "not_found";
        let detail = "当前版本未找到可核实的来源证据";
        if (value !== null && evidence?.quote && evidence.page) {
          state = "supported";
          detail = "字段值与来源短引、页码同时存在";
        } else if (value !== null && (evidence?.quote || evidence?.page)) {
          state = "partial";
          detail = "存在字段值和部分来源信息，仍需人工抽查";
        } else if (value !== null) {
          state = "partial";
          detail = "存在字段值，但没有足够的页码与短引";
        }
        this.connection
          .prepare(
            `
          INSERT INTO verification_results(publication_id, field_key, state, detail, evidence_page, checked_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            publicationId,
            String(field.field_key),
            state,
            detail,
            evidence?.page ?? null,
            checkedAt
          );
      }
    });
    this.audit(null, "publication.verified", "publication", publicationId, {
      fields: fields.length,
    });
  }

  private expirePublications() {
    const current = now();
    this.connection
      .prepare(
        "UPDATE publications SET state = 'expired', updated_at = ? WHERE expires_at IS NOT NULL AND expires_at <= ? AND state = 'published'"
      )
      .run(current, current);
    this.connection
      .prepare(
        "UPDATE download_requests SET state = 'expired' WHERE expires_at IS NOT NULL AND expires_at <= ? AND state = 'approved'"
      )
      .run(current);
  }

  private access(user: SessionUser, publicationId: string) {
    const publication = this.connection
      .prepare("SELECT * FROM publications WHERE id = ?")
      .get(publicationId) as Row | undefined;
    if (!publication) throw new AuthError("共享项目不存在", 404);
    if (user.role === "admin")
      return {
        publication,
        canViewFields: true,
        canViewFiles: true,
        canRequestDownload: true,
      };
    const member = this.connection
      .prepare(
        "SELECT * FROM publication_members WHERE publication_id = ? AND user_id = ?"
      )
      .get(publicationId, user.id) as Row | undefined;
    if (!member) throw new AuthError("你没有访问该项目的权限", 403);
    if (String(publication.state) !== "published")
      throw new AuthError("该项目当前不可访问", 403);
    if (
      typeof publication.expires_at === "string" &&
      publication.expires_at <= now()
    )
      throw new AuthError("该项目分享已经过期", 403);
    return {
      publication,
      canViewFields: Boolean(member.can_view_fields),
      canViewFiles: Boolean(member.can_view_files),
      canRequestDownload: Boolean(member.can_request_download),
    };
  }

  listPortalProjects(user: SessionUser) {
    this.expirePublications();
    const rows =
      user.role === "admin"
        ? this.connection
            .prepare(
              `
          SELECT p.id FROM publications p WHERE p.state = 'published' ORDER BY p.updated_at DESC
        `
            )
            .all()
        : this.connection
            .prepare(
              `
          SELECT p.id FROM publications p JOIN publication_members pm ON pm.publication_id = p.id
          WHERE pm.user_id = ? AND p.state = 'published' ORDER BY p.updated_at DESC
        `
            )
            .all(user.id);
    return rows.map(row =>
      this.getPortalProject(user, String((row as Row).id))
    );
  }

  getPortalProject(user: SessionUser, publicationId: string): PortalProject {
    const permission = this.access(user, publicationId);
    const snapshotRow = this.connection
      .prepare(
        `
      SELECT payload_json FROM publication_snapshots WHERE publication_id = ? ORDER BY remote_version DESC LIMIT 1
    `
      )
      .get(publicationId) as Row | undefined;
    if (!snapshotRow) throw new AuthError("共享快照尚未生成", 409);
    const payload = parseJson<SnapshotPayload>(
      snapshotRow.payload_json,
      {} as SnapshotPayload
    );
    const verification = new Map(
      this.connection
        .prepare(
          "SELECT field_key, state FROM verification_results WHERE publication_id = ?"
        )
        .all(publicationId)
        .map(row => [
          String((row as Row).field_key),
          String((row as Row).state) as VerificationState,
        ])
    );
    const publication = permission.publication;
    const files = permission.canViewFiles
      ? payload.files.map(file => ({
          ...file,
          securityMode: String(publication.security_mode) as SecurityMode,
          canRequestDownload: permission.canRequestDownload,
          viewerUrl: `/portal/files/${file.id}?publicationId=${encodeURIComponent(publicationId)}`,
        }))
      : [];
    return {
      publicationId,
      projectId: payload.project.id,
      name: payload.project.name,
      product: payload.project.product,
      industry: payload.project.industry,
      fundingRound: payload.project.fundingRound,
      status: payload.project.managementStatus,
      summary: payload.analysis?.summary ?? null,
      shareMode: String(publication.share_mode) as ShareMode,
      securityMode: String(publication.security_mode) as SecurityMode,
      publishedAt:
        typeof publication.published_at === "string"
          ? publication.published_at
          : null,
      expiresAt:
        typeof publication.expires_at === "string"
          ? publication.expires_at
          : null,
      fields: permission.canViewFields
        ? payload.fields.map(field => ({
            ...field,
            label: field.label ?? projectFieldMetadata(field.key).label,
            englishLabel:
              field.englishLabel ??
              projectFieldMetadata(field.key).englishLabel,
            verification: verification.get(field.key) ?? "not_found",
          }))
        : [],
      analysis:
        permission.canViewFields && payload.analysis
          ? {
              risks: payload.analysis.risks,
              missingInformation: payload.analysis.missingInformation,
              commercialChecks: payload.analysis.commercialChecks,
            }
          : null,
      files,
    };
  }

  getSharedFile(
    user: SessionUser,
    publicationId: string,
    fileId: string,
    request?: Request
  ) {
    const permission = this.access(user, publicationId);
    if (!permission.canViewFiles) throw new AuthError("没有文件浏览权限", 403);
    const row = this.connection
      .prepare(
        `
      SELECT pf.*, pfi.object_key FROM publication_files pfi JOIN project_files pf ON pf.id = pfi.file_id
      WHERE pfi.publication_id = ? AND pfi.file_id = ?
    `
      )
      .get(publicationId, fileId) as Row | undefined;
    if (!row || typeof row.object_key !== "string")
      throw new AuthError("共享文件尚未同步", 404);
    this.audit(user, "file.viewed", "file", fileId, { publicationId }, request);
    return {
      row,
      absolutePath: privateObjectStorage.resolveObject(row.object_key),
      securityMode: String(
        permission.publication.security_mode
      ) as SecurityMode,
    };
  }

  private linkPublication(shareToken: string) {
    this.expirePublications();
    const publication = this.connection
      .prepare("SELECT * FROM publications WHERE share_token = ?")
      .get(shareToken) as Row | undefined;
    if (!publication) throw new AuthError("分享链接不存在", 404);
    if (String(publication.state) !== "published")
      throw new AuthError("该分享链接当前不可访问", 403);
    if (
      typeof publication.expires_at === "string" &&
      publication.expires_at <= now()
    )
      throw new AuthError("该分享链接已经过期", 403);
    return publication;
  }

  private authorizeLinkPublication(
    publication: Row,
    shareToken: string,
    request?: Request,
    required = true
  ) {
    const accessMode = publicationAccessMode(publication);
    if (accessMode === "open")
      return { authenticated: true, viewer: null, accessMode } as const;
    if (accessMode === "passcode") {
      const accessCodeHash =
        typeof publication.access_code_hash === "string"
          ? publication.access_code_hash
          : "";
      if (!accessCodeHash) throw new AuthError("该分享的访问码配置不完整", 503);
      const session = request
        ? parse(request.headers.cookie ?? "")[SHARE_ACCESS_COOKIE]
        : undefined;
      const authenticated = verifyShareAccessSession(
        shareToken,
        accessCodeHash,
        session
      );
      if (!authenticated && required)
        throw new AuthError("请输入 6 位访问码", 401);
      return { authenticated, viewer: null, accessMode } as const;
    }
    const user = request ? collaborationAuth.getSession(request) : null;
    const membership = user
      ? (this.connection
          .prepare(
            `SELECT u.email, u.name, u.role
             FROM publication_members pm
             JOIN collaboration_users u ON u.id = pm.user_id
             WHERE pm.publication_id = ? AND pm.user_id = ? AND u.state = 'active'`
          )
          .get(String(publication.id), user.id) as Row | undefined)
      : undefined;
    if (!membership && required)
      throw new AuthError("请先使用受邀邮箱验证身份", 401);
    return {
      authenticated: Boolean(membership),
      viewer: membership
        ? {
            email: String(membership.email),
            name: String(membership.name),
            role: String(membership.role) as "internal" | "external",
          }
        : null,
      accessMode,
    } as const;
  }

  getLinkAuthStatus(shareToken: string, request?: Request) {
    const publication = this.linkPublication(shareToken);
    const access = this.authorizeLinkPublication(
      publication,
      shareToken,
      request,
      false
    );
    return {
      accessMode: access.accessMode,
      required: access.accessMode !== "open",
      authenticated: access.authenticated,
      providerConfigured:
        access.accessMode === "member_email"
          ? request
            ? collaborationAuth.emailOtpStatus(request).mode !== "unavailable"
            : false
          : true,
      viewer: access.viewer,
    };
  }

  assertLinkMemberEmail(shareToken: string, email: string) {
    const publication = this.linkPublication(shareToken);
    if (publicationAccessMode(publication) !== "member_email")
      throw new AuthError("该分享未启用邮箱成员验证", 400);
    const member = this.connection
      .prepare(
        `SELECT u.email, u.name, u.role
         FROM publication_members pm
         JOIN collaboration_users u ON u.id = pm.user_id
         WHERE pm.publication_id = ? AND LOWER(u.email) = LOWER(?) AND u.state = 'active'`
      )
      .get(String(publication.id), email.trim()) as Row | undefined;
    if (!member) throw new AuthError("该邮箱没有这个项目的查看权限", 403);
    return member;
  }

  verifyLinkAccessCode(
    shareToken: string,
    accessCode: string,
    request?: Request
  ) {
    const publication = this.linkPublication(shareToken);
    if (publicationAccessMode(publication) !== "passcode")
      throw new AuthError("该分享未启用访问码", 400);
    const accessCodeHash =
      typeof publication.access_code_hash === "string"
        ? publication.access_code_hash
        : "";
    if (!accessCodeHash) throw new AuthError("该分享的访问码配置不完整", 503);
    const addressHash = crypto
      .createHash("sha256")
      .update(requestIp(request) ?? "unknown")
      .digest("hex");
    const attemptKey = `share:${String(publication.id)}:${addressHash}`;
    const current = now();
    const attempt = this.connection
      .prepare("SELECT * FROM auth_login_attempts WHERE attempt_key = ?")
      .get(attemptKey) as Row | undefined;
    if (
      typeof attempt?.blocked_until === "string" &&
      attempt.blocked_until > current
    )
      throw new AuthError("访问码尝试次数过多，请稍后再试", 429);
    if (!verifyShareAccessCode(accessCode, accessCodeHash)) {
      const windowStarted =
        typeof attempt?.window_started_at === "string" &&
        Date.parse(current) - Date.parse(attempt.window_started_at) <
          10 * 60_000
          ? attempt.window_started_at
          : current;
      const failures =
        windowStarted === current ? 1 : Number(attempt?.failures ?? 0) + 1;
      const blockedUntil =
        failures >= 5
          ? new Date(Date.parse(current) + 15 * 60_000).toISOString()
          : null;
      this.connection
        .prepare(
          `INSERT INTO auth_login_attempts(attempt_key, failures, window_started_at, blocked_until)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(attempt_key) DO UPDATE SET failures = excluded.failures,
             window_started_at = excluded.window_started_at,
             blocked_until = excluded.blocked_until`
        )
        .run(attemptKey, failures, windowStarted, blockedUntil);
      throw new AuthError(
        blockedUntil ? "访问码尝试次数过多，请稍后再试" : "访问码不正确",
        blockedUntil ? 429 : 401
      );
    }
    this.connection
      .prepare("DELETE FROM auth_login_attempts WHERE attempt_key = ?")
      .run(attemptKey);
    this.audit(
      null,
      "share_link.passcode_verified",
      "publication",
      String(publication.id),
      {},
      request
    );
    return createShareAccessSession(shareToken, accessCodeHash);
  }

  private toShareAnnotation(row: Row): ShareAnnotation {
    return {
      id: String(row.id),
      publicationId: String(row.publication_id),
      fileId: typeof row.file_id === "string" ? row.file_id : null,
      fieldKey: typeof row.field_key === "string" ? row.field_key : null,
      pageNumber: typeof row.page_number === "number" ? row.page_number : null,
      parentId: typeof row.parent_id === "string" ? row.parent_id : null,
      authorName: String(row.author_name),
      authorEmail:
        typeof row.author_email === "string" ? row.author_email : null,
      body: String(row.body),
      status: String(row.status) as ShareAnnotation["status"],
      revision: Number(row.revision),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  listLinkAnnotations(
    shareToken: string,
    afterRevision = 0,
    request?: Request
  ) {
    const publication = this.linkPublication(shareToken);
    this.authorizeLinkPublication(publication, shareToken, request);
    const annotations = this.connection
      .prepare(
        `SELECT * FROM share_annotations
         WHERE publication_id = ? AND revision > ?
         ORDER BY revision ASC LIMIT 500`
      )
      .all(String(publication.id), Math.max(0, afterRevision))
      .map(row => this.toShareAnnotation(row as Row));
    return {
      revision: Number(publication.annotation_revision ?? 0),
      annotations,
    };
  }

  getLinkShare(shareToken: string, request?: Request): LinkShareProject {
    const publication = this.linkPublication(shareToken);
    const access = this.authorizeLinkPublication(
      publication,
      shareToken,
      request
    );
    const publicationId = String(publication.id);
    const project = this.getPortalProject(
      {
        id: "share-link",
        email: "share-link@cofound.local",
        name: "分享链接访客",
        role: "admin",
        state: "active",
        languagePreference: "bilingual",
      },
      publicationId
    );
    const annotations = this.listLinkAnnotations(
      shareToken,
      0,
      request
    ).annotations;
    this.audit(
      null,
      "share_link.viewed",
      "publication",
      publicationId,
      {},
      request
    );
    return {
      ...project,
      shareToken,
      revision: Number(publication.annotation_revision ?? 0),
      annotationEnabled: Boolean(publication.annotation_enabled),
      downloadEnabled: false,
      viewer: access.viewer,
      files: project.files.map(file => ({
        ...file,
        canRequestDownload: false,
        viewerUrl: `/api/lite?action=file&token=${encodeURIComponent(shareToken)}&fileId=${encodeURIComponent(file.id)}`,
      })),
      annotations,
    };
  }

  createLinkAnnotation(
    shareToken: string,
    input: {
      authorName: string;
      authorEmail?: string | null;
      body: string;
      fileId?: string | null;
      fieldKey?: string | null;
      pageNumber?: number | null;
      parentId?: string | null;
    },
    request?: Request
  ) {
    const publication = this.linkPublication(shareToken);
    this.authorizeLinkPublication(publication, shareToken, request);
    if (!Boolean(publication.annotation_enabled))
      throw new AuthError("该分享未开启协作批注", 403);
    const publicationId = String(publication.id);
    if (input.fileId) {
      const allowed = this.connection
        .prepare(
          "SELECT 1 FROM publication_files WHERE publication_id = ? AND file_id = ?"
        )
        .get(publicationId, input.fileId);
      if (!allowed) throw new AuthError("批注文件不在共享范围内", 400);
    }
    if (input.fieldKey) {
      const allowed = this.connection
        .prepare(
          "SELECT 1 FROM publication_fields WHERE publication_id = ? AND field_key = ?"
        )
        .get(publicationId, input.fieldKey);
      if (!allowed) throw new AuthError("批注字段不在共享范围内", 400);
    }
    if (input.parentId) {
      const parent = this.connection
        .prepare(
          "SELECT 1 FROM share_annotations WHERE id = ? AND publication_id = ?"
        )
        .get(input.parentId, publicationId);
      if (!parent) throw new AuthError("回复的批注不存在", 400);
    }
    const id = crypto.randomUUID();
    const createdAt = now();
    let revision = 0;
    getDatabase().transaction(() => {
      revision =
        Number(
          (
            this.connection
              .prepare(
                "SELECT annotation_revision FROM publications WHERE id = ?"
              )
              .get(publicationId) as Row
          ).annotation_revision ?? 0
        ) + 1;
      this.connection
        .prepare(
          `INSERT INTO share_annotations(
             id, publication_id, file_id, field_key, page_number, parent_id,
             author_name, author_email, body, status, revision, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
        )
        .run(
          id,
          publicationId,
          input.fileId ?? null,
          input.fieldKey ?? null,
          input.pageNumber ?? null,
          input.parentId ?? null,
          input.authorName.trim(),
          input.authorEmail?.trim() || null,
          input.body.trim(),
          revision,
          createdAt,
          createdAt
        );
      this.connection
        .prepare(
          "UPDATE publications SET annotation_revision = ?, updated_at = ? WHERE id = ?"
        )
        .run(revision, createdAt, publicationId);
    });
    this.audit(
      null,
      "annotation.created",
      "annotation",
      id,
      { publicationId, authorName: input.authorName.trim(), revision },
      request
    );
    return this.toShareAnnotation(
      this.connection
        .prepare("SELECT * FROM share_annotations WHERE id = ?")
        .get(id) as Row
    );
  }

  resolveLinkAnnotation(
    shareToken: string,
    annotationId: string,
    resolved: boolean,
    request?: Request
  ) {
    const publication = this.linkPublication(shareToken);
    this.authorizeLinkPublication(publication, shareToken, request);
    const publicationId = String(publication.id);
    const existing = this.connection
      .prepare(
        "SELECT * FROM share_annotations WHERE id = ? AND publication_id = ?"
      )
      .get(annotationId, publicationId) as Row | undefined;
    if (!existing) throw new AuthError("批注不存在", 404);
    const updatedAt = now();
    let revision = 0;
    getDatabase().transaction(() => {
      revision = Number(publication.annotation_revision ?? 0) + 1;
      this.connection
        .prepare(
          "UPDATE share_annotations SET status = ?, revision = ?, updated_at = ? WHERE id = ?"
        )
        .run(resolved ? "resolved" : "open", revision, updatedAt, annotationId);
      this.connection
        .prepare(
          "UPDATE publications SET annotation_revision = ?, updated_at = ? WHERE id = ?"
        )
        .run(revision, updatedAt, publicationId);
    });
    this.audit(
      null,
      resolved ? "annotation.resolved" : "annotation.reopened",
      "annotation",
      annotationId,
      { publicationId, revision },
      request
    );
    return this.toShareAnnotation(
      this.connection
        .prepare("SELECT * FROM share_annotations WHERE id = ?")
        .get(annotationId) as Row
    );
  }

  getLinkSharedFile(shareToken: string, fileId: string, request?: Request) {
    const publication = this.linkPublication(shareToken);
    this.authorizeLinkPublication(publication, shareToken, request);
    const publicationId = String(publication.id);
    const row = this.connection
      .prepare(
        `SELECT pf.*, pfi.object_key
         FROM publication_files pfi
         JOIN project_files pf ON pf.id = pfi.file_id
         WHERE pfi.publication_id = ? AND pfi.file_id = ?`
      )
      .get(publicationId, fileId) as Row | undefined;
    if (!row || typeof row.object_key !== "string")
      throw new AuthError("共享文件尚未同步", 404);
    this.audit(
      null,
      "share_link.file_viewed",
      "file",
      fileId,
      { publicationId },
      request
    );
    return {
      row,
      absolutePath: privateObjectStorage.resolveObject(row.object_key),
    };
  }

  searchSharedFile(
    user: SessionUser,
    publicationId: string,
    fileId: string,
    query: string,
    request?: Request
  ) {
    const { row } = this.getSharedFile(user, publicationId, fileId, request);
    const text = String(row.extracted_text ?? "");
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const segments = text.split(/\n\s*\n/u);
    return segments
      .flatMap((segment, index) =>
        segment.toLocaleLowerCase().includes(needle)
          ? [
              {
                segment: index + 1,
                excerpt: segment.slice(
                  Math.max(0, segment.toLocaleLowerCase().indexOf(needle) - 80),
                  segment.toLocaleLowerCase().indexOf(needle) +
                    needle.length +
                    160
                ),
              },
            ]
          : []
      )
      .slice(0, 20);
  }

  createDownloadRequest(
    user: SessionUser,
    publicationId: string,
    fileId: string,
    purpose: string,
    request?: Request
  ) {
    const permission = this.access(user, publicationId);
    if (!permission.canRequestDownload)
      throw new AuthError("没有下载申请权限", 403);
    if (purpose.trim().length < 4) throw new AuthError("请填写下载用途", 400);
    const sharedFile = this.connection
      .prepare(
        "SELECT 1 FROM publication_files WHERE publication_id = ? AND file_id = ?"
      )
      .get(publicationId, fileId);
    if (!sharedFile) throw new AuthError("文件不在当前共享范围内", 404);
    const existing = this.connection
      .prepare(
        `
      SELECT * FROM download_requests WHERE publication_id = ? AND file_id = ? AND requester_id = ? AND state IN ('pending','approved') ORDER BY requested_at DESC LIMIT 1
    `
      )
      .get(publicationId, fileId, user.id) as Row | undefined;
    if (existing) return this.toDownloadRequest(existing);
    const id = crypto.randomUUID();
    const requestedAt = now();
    this.connection
      .prepare(
        `
      INSERT INTO download_requests(id, publication_id, file_id, requester_id, purpose, state, requested_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `
      )
      .run(id, publicationId, fileId, user.id, purpose.trim(), requestedAt);
    this.audit(
      user,
      "download.requested",
      "download_request",
      id,
      { publicationId, fileId, purpose: purpose.trim() },
      request
    );
    return this.getDownloadRequest(id)!;
  }

  private downloadRequestRows(
    where = "1 = 1",
    params: Array<string | number> = []
  ) {
    return this.connection
      .prepare(
        `
      SELECT d.*, pr.name AS project_name, pf.original_name AS file_name,
        requester.name AS requester_name, requester.email AS requester_email,
        reviewer.name AS reviewer_name
      FROM download_requests d
      JOIN publications p ON p.id = d.publication_id JOIN projects pr ON pr.id = p.project_id
      JOIN project_files pf ON pf.id = d.file_id JOIN collaboration_users requester ON requester.id = d.requester_id
      LEFT JOIN collaboration_users reviewer ON reviewer.id = d.reviewer_id
      WHERE ${where} ORDER BY d.requested_at DESC
    `
      )
      .all(...params) as Row[];
  }

  private toDownloadRequest(row: Row): DownloadRequest {
    return {
      id: String(row.id),
      publicationId: String(row.publication_id),
      projectName: String(row.project_name ?? ""),
      fileId: String(row.file_id),
      fileName: String(row.file_name ?? ""),
      requesterId: String(row.requester_id),
      requesterName: String(row.requester_name ?? ""),
      requesterEmail: String(row.requester_email ?? ""),
      purpose: String(row.purpose),
      state: String(row.state) as DownloadRequest["state"],
      reviewerName:
        typeof row.reviewer_name === "string" ? row.reviewer_name : null,
      reviewerNote:
        typeof row.reviewer_note === "string" ? row.reviewer_note : null,
      requestedAt: String(row.requested_at),
      decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
      expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
      downloadUrl: null,
    };
  }

  getDownloadRequest(id: string) {
    const row = this.downloadRequestRows("d.id = ?", [id])[0];
    return row ? this.toDownloadRequest(row) : null;
  }

  listDownloadRequests(user: SessionUser) {
    this.expirePublications();
    const rows =
      user.role === "admin"
        ? this.downloadRequestRows()
        : this.downloadRequestRows("d.requester_id = ?", [user.id]);
    return rows.map(row => this.toDownloadRequest(row));
  }

  decideDownload(input: {
    id: string;
    approve: boolean;
    note: string;
    actor: SessionUser;
    request?: Request;
  }) {
    const existing = this.connection
      .prepare(
        "SELECT * FROM download_requests WHERE id = ? AND state = 'pending'"
      )
      .get(input.id) as Row | undefined;
    if (!existing) throw new AuthError("申请不存在或已处理", 409);
    const decidedAt = now();
    const expiresAt = input.approve
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;
    this.connection
      .prepare(
        `
      UPDATE download_requests SET state = ?, reviewer_id = ?, reviewer_note = ?, decided_at = ?, expires_at = ? WHERE id = ?
    `
      )
      .run(
        input.approve ? "approved" : "rejected",
        input.actor.id,
        input.note.trim() || null,
        decidedAt,
        expiresAt,
        input.id
      );
    if (input.approve)
      this.enqueue(
        "watermarked_download",
        null,
        String(existing.publication_id),
        { requestId: input.id }
      );
    this.audit(
      input.actor,
      input.approve ? "download.approved" : "download.rejected",
      "download_request",
      input.id,
      { note: input.note.trim() },
      input.request
    );
    return this.getDownloadRequest(input.id)!;
  }

  createDownloadLink(
    user: SessionUser,
    requestId: string,
    baseUrl: string,
    request?: Request
  ) {
    const download = this.getDownloadRequest(requestId);
    if (!download || download.requesterId !== user.id)
      throw new AuthError("下载申请不存在", 404);
    if (
      download.state !== "approved" ||
      !download.expiresAt ||
      download.expiresAt <= now()
    )
      throw new AuthError("下载尚未获批或已经过期", 409);
    const rawToken = randomToken();
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(
      Math.min(
        new Date(download.expiresAt).getTime(),
        Date.now() + 15 * 60 * 1000
      )
    ).toISOString();
    this.connection
      .prepare("DELETE FROM download_tokens WHERE request_id = ?")
      .run(requestId);
    this.connection
      .prepare(
        `
      INSERT INTO download_tokens(id, request_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(tokenId, requestId, hashToken(rawToken), expiresAt, now());
    this.audit(
      user,
      "download.link_created",
      "download_request",
      requestId,
      { expiresAt },
      request
    );
    return {
      url: `${baseUrl.replace(/\/$/, "")}/api/portal/download/${rawToken}`,
      expiresAt,
    };
  }

  consumeDownload(user: SessionUser, rawToken: string, request?: Request) {
    const current = now();
    const row = this.connection
      .prepare(
        `
      SELECT t.id AS token_id, t.request_id, d.* FROM download_tokens t
      JOIN download_requests d ON d.id = t.request_id
      WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ? AND d.state = 'approved' AND d.requester_id = ?
    `
      )
      .get(hashToken(rawToken), current, user.id) as Row | undefined;
    if (!row) throw new AuthError("下载链接无效、已使用或已经过期", 403);
    const file = this.getSharedFile(
      user,
      String(row.publication_id),
      String(row.file_id),
      request
    );
    return {
      ...file,
      downloadRequestId: String(row.request_id),
      downloadTokenId: String(row.token_id),
      publicationId: String(row.publication_id),
    };
  }

  completeDownload(
    user: SessionUser,
    input: {
      tokenId: string;
      requestId: string;
      fileId: string;
      publicationId: string;
    },
    request?: Request
  ) {
    const completedAt = now();
    getDatabase().transaction(() => {
      const token = this.connection
        .prepare("SELECT used_at FROM download_tokens WHERE id = ?")
        .get(input.tokenId) as Row | undefined;
      if (!token || token.used_at) throw new AuthError("下载链接已经使用", 409);
      this.connection
        .prepare("UPDATE download_tokens SET used_at = ? WHERE id = ?")
        .run(completedAt, input.tokenId);
      this.connection
        .prepare(
          "UPDATE download_requests SET state = 'downloaded' WHERE id = ?"
        )
        .run(input.requestId);
    });
    this.audit(
      user,
      "file.downloaded",
      "file",
      input.fileId,
      { requestId: input.requestId, publicationId: input.publicationId },
      request
    );
  }

  fileTextPages(row: Row) {
    const text = String(row.extracted_text ?? "");
    const formFeed = text.split(/\f/u).filter(page => page.trim());
    if (formFeed.length > 1) return formFeed;
    const chunks = text.split(/\n\s*\n/u).filter(part => part.trim());
    const expected = Math.max(1, Number(row.page_count ?? 1));
    const perPage = Math.max(1, Math.ceil(chunks.length / expected));
    const pages: string[] = [];
    for (let index = 0; index < expected; index += 1) {
      pages.push(
        chunks.slice(index * perPage, (index + 1) * perPage).join("\n\n") ||
          "该页没有可提取文本，请结合其他页面核验。"
      );
    }
    return pages;
  }

  resolveDownloadOutputPath(requestId: string) {
    const root = path.join(getDatabase().dataDir, "shared-downloads");
    fs.mkdirSync(root, { recursive: true });
    return path.join(root, `${requestId}.pdf`);
  }
}

export const collaborationService = new CollaborationService();
