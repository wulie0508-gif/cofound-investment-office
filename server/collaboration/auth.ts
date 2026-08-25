import { parse, serialize } from "cookie";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import type {
  Invitation,
  SessionUser,
  UiLanguagePreference,
  UserRole,
} from "../../shared/collaboration";
import { getDatabase } from "../local/database";

const SESSION_COOKIE = "cofound_share_session";
const SESSION_DAYS = 7;
const OTP_TTL_MINUTES = 10;
const LOCAL_ADMIN_PLACEHOLDER_EMAIL = "leader@cofound.local";
const LOCAL_ADMIN_PLACEHOLDER_NAME = "本机管理员";

type Row = Record<string, unknown>;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 401
  ) {
    super(message);
  }
}

function isoAfterDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string) {
  if (password.length < 10) throw new AuthError("密码至少需要 10 个字符", 400);
  const salt = crypto.randomBytes(16);
  const result = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${result.toString("base64")}`;
}

export function verifyPassword(password: string, encoded: string | null) {
  if (!encoded) return false;
  const [kind, saltValue, hashValue] = encoded.split("$");
  if (kind !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64");
  const actual = crypto.scryptSync(
    password,
    Buffer.from(saltValue, "base64"),
    expected.length
  );
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

function toUser(row: Row): SessionUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as UserRole,
    state: String(row.state) as SessionUser["state"],
    languagePreference: ["bilingual", "zh-CN", "en"].includes(
      String(row.language_preference)
    )
      ? (String(row.language_preference) as UiLanguagePreference)
      : "bilingual",
  };
}

function requestMetadata(request: Request) {
  return {
    ip: request.ip || request.socket.remoteAddress || null,
    userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
  };
}

function isLoopback(request: Request) {
  const address = request.socket.remoteAddress;
  return Boolean(
    address && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)
  );
}

function normalizeEmail(value: string) {
  const email = value.trim().toLocaleLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AuthError("请输入有效邮箱", 400);
  return email;
}

function normalizeName(value: string | undefined) {
  const name = value?.trim();
  if (!name) return null;
  if (name.length > 80)
    throw new AuthError("姓名或昵称不能超过 80 个字符", 400);
  return name;
}

function maskedEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

export class CollaborationAuth {
  private get connection() {
    return getDatabase().connection;
  }

  ensureLocalAdmin() {
    const bootstrapPassword = process.env.COF_BP_ADMIN_BOOTSTRAP_PASSWORD;
    const existing = this.connection
      .prepare(
        "SELECT * FROM collaboration_users WHERE role = 'admin' ORDER BY created_at LIMIT 1"
      )
      .get() as Row | undefined;
    if (existing) {
      if (!existing.password_hash && bootstrapPassword) {
        this.connection
          .prepare(
            "UPDATE collaboration_users SET password_hash = ?, updated_at = ? WHERE id = ?"
          )
          .run(
            hashPassword(bootstrapPassword),
            new Date().toISOString(),
            String(existing.id)
          );
      }
      return toUser(existing);
    }
    if (process.env.COF_BP_MODE === "shared" && !bootstrapPassword) {
      throw new Error(
        "共享部署首次启动必须设置 COF_BP_ADMIN_BOOTSTRAP_PASSWORD（至少 10 个字符）"
      );
    }
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const email =
      process.env.COF_BP_ADMIN_EMAIL?.trim().toLocaleLowerCase() ||
      LOCAL_ADMIN_PLACEHOLDER_EMAIL;
    const name =
      process.env.COF_BP_ADMIN_NAME?.trim() || LOCAL_ADMIN_PLACEHOLDER_NAME;
    this.connection
      .prepare(
        `
      INSERT INTO collaboration_users(id, email, name, role, state, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?)
    `
      )
      .run(
        id,
        email,
        name,
        bootstrapPassword ? hashPassword(bootstrapPassword) : null,
        createdAt,
        createdAt
      );
    return {
      id,
      email,
      name,
      role: "admin",
      state: "active",
      languagePreference: "bilingual",
    } satisfies SessionUser;
  }

  private createSession(
    user: SessionUser,
    request: Request,
    response: Response
  ) {
    const rawToken = randomToken();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = isoAfterDays(SESSION_DAYS);
    const metadata = requestMetadata(request);
    this.connection
      .prepare(
        `
      INSERT INTO auth_sessions(id, user_id, token_hash, expires_at, created_at, last_seen_at, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        user.id,
        hashToken(rawToken),
        expiresAt,
        createdAt,
        createdAt,
        metadata.ip,
        metadata.userAgent
      );
    response.setHeader(
      "Set-Cookie",
      serialize(SESSION_COOKIE, rawToken, {
        httpOnly: true,
        sameSite: "strict",
        secure:
          process.env.NODE_ENV === "production" ||
          process.env.COF_BP_MODE === "shared",
        path: "/",
        maxAge: SESSION_DAYS * 24 * 60 * 60,
      })
    );
    this.connection
      .prepare(
        "UPDATE collaboration_users SET last_signed_in_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(createdAt, createdAt, user.id);
    return user;
  }

  bootstrapLocalAdmin(request: Request, response: Response) {
    if (process.env.COF_BP_MODE === "shared")
      throw new AuthError("共享部署不允许本机免密登录", 403);
    if (!isLoopback(request)) {
      throw new AuthError("仅本机可建立管理员会话", 403);
    }
    return this.createSession(this.ensureLocalAdmin(), request, response);
  }

  emailOtpStatus(request: Request) {
    const admin = this.ensureLocalAdmin();
    const supabaseConfigured = Boolean(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim()
    );
    return {
      mode: supabaseConfigured
        ? ("supabase" as const)
        : isLoopback(request) && process.env.COF_BP_MODE !== "shared"
          ? ("local_preview" as const)
          : ("unavailable" as const),
      needsLocalAdminSetup:
        isLoopback(request) &&
        (admin.email === LOCAL_ADMIN_PLACEHOLDER_EMAIL ||
          admin.name === LOCAL_ADMIN_PLACEHOLDER_NAME),
      configuredAdminEmail:
        admin.email === LOCAL_ADMIN_PLACEHOLDER_EMAIL
          ? null
          : maskedEmail(admin.email),
    };
  }

  private supabase() {
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

  private prepareEmailIdentity(
    email: string,
    name: string | null,
    request: Request
  ) {
    const existing = this.connection
      .prepare(
        "SELECT * FROM collaboration_users WHERE email = ? COLLATE NOCASE LIMIT 1"
      )
      .get(email) as Row | undefined;
    if (existing) {
      if (String(existing.state) === "suspended")
        throw new AuthError("该账号已被停用", 403);
      return;
    }
    const invitation = this.connection
      .prepare(
        "SELECT * FROM invitations WHERE email = ? COLLATE NOCASE AND state = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(email, new Date().toISOString()) as Row | undefined;
    if (invitation) return;

    const admin = this.ensureLocalAdmin();
    const canBindLocalAdmin =
      isLoopback(request) &&
      process.env.COF_BP_MODE !== "shared" &&
      admin.email === LOCAL_ADMIN_PLACEHOLDER_EMAIL;
    if (!canBindLocalAdmin) throw new AuthError("该邮箱尚未收到协作邀请", 403);
    if (!name) throw new AuthError("首次绑定本机管理员时请填写姓名或昵称", 400);
    const stamp = new Date().toISOString();
    try {
      this.connection
        .prepare(
          "UPDATE collaboration_users SET email = ?, name = ?, updated_at = ? WHERE id = ?"
        )
        .run(email, name, stamp, admin.id);
    } catch {
      throw new AuthError("该邮箱已绑定其他账号", 409);
    }
  }

  async requestEmailOtp(
    input: { email: string; name?: string },
    request: Request
  ) {
    const email = normalizeEmail(input.email);
    const name = normalizeName(input.name);
    this.prepareEmailIdentity(email, name, request);
    const supabase = this.supabase();
    if (supabase) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: name ? { display_name: name } : undefined,
        },
      });
      if (error) throw new AuthError(`验证码发送失败：${error.message}`, 502);
      return {
        delivery: "email" as const,
        maskedEmail: maskedEmail(email),
        expiresInSeconds: OTP_TTL_MINUTES * 60,
        previewCode: null,
      };
    }
    if (!isLoopback(request) || process.env.COF_BP_MODE === "shared")
      throw new AuthError("邮箱验证码服务尚未配置", 503);
    const latest = this.connection
      .prepare(
        "SELECT created_at FROM auth_email_otps WHERE email = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(email) as Row | undefined;
    if (
      latest &&
      Date.now() - new Date(String(latest.created_at)).getTime() < 30_000
    )
      throw new AuthError("验证码已发送，请稍后再试", 429);
    const code = crypto.randomInt(100000, 1000000).toString();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + OTP_TTL_MINUTES * 60 * 1000
    ).toISOString();
    this.connection
      .prepare(
        `INSERT INTO auth_email_otps(
          id, email, token_hash, expires_at, attempts, max_attempts,
          consumed_at, created_at, ip
        ) VALUES (?, ?, ?, ?, 0, 5, NULL, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        email,
        hashToken(`${email}|${code}`),
        expiresAt,
        createdAt,
        requestMetadata(request).ip
      );
    return {
      delivery: "local_preview" as const,
      maskedEmail: maskedEmail(email),
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      previewCode: code,
    };
  }

  private activateEmailIdentity(email: string, requestedName: string | null) {
    const current = new Date().toISOString();
    let row = this.connection
      .prepare(
        "SELECT * FROM collaboration_users WHERE email = ? COLLATE NOCASE LIMIT 1"
      )
      .get(email) as Row | undefined;
    if (row && String(row.state) === "suspended")
      throw new AuthError("该账号已被停用", 403);
    const invitation = this.connection
      .prepare(
        "SELECT * FROM invitations WHERE email = ? COLLATE NOCASE AND state = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(email, current) as Row | undefined;
    if (!row && !invitation) throw new AuthError("该邮箱尚未收到协作邀请", 403);
    if (!row && invitation) {
      const id = crypto.randomUUID();
      const name = requestedName || String(invitation.name);
      this.connection
        .prepare(
          `INSERT INTO collaboration_users(
            id, email, name, role, state, password_hash, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', NULL, ?, ?)`
        )
        .run(id, email, name, String(invitation.role), current, current);
      row = this.connection
        .prepare("SELECT * FROM collaboration_users WHERE id = ?")
        .get(id) as Row;
    } else if (row) {
      const nextName = requestedName || String(row.name);
      this.connection
        .prepare(
          "UPDATE collaboration_users SET name = ?, state = 'active', updated_at = ? WHERE id = ?"
        )
        .run(nextName, current, String(row.id));
      row = this.connection
        .prepare("SELECT * FROM collaboration_users WHERE id = ?")
        .get(String(row.id)) as Row;
    }
    if (invitation)
      this.connection
        .prepare(
          "UPDATE invitations SET state = 'accepted', accepted_at = ? WHERE id = ?"
        )
        .run(current, String(invitation.id));
    return toUser(row!);
  }

  async verifyEmailOtp(
    input: { email: string; token: string; name?: string },
    request: Request,
    response: Response
  ) {
    const email = normalizeEmail(input.email);
    const name = normalizeName(input.name);
    const token = input.token.trim();
    if (!/^\d{6}$/.test(token)) throw new AuthError("请输入 6 位验证码", 400);
    this.prepareEmailIdentity(email, name, request);
    const supabase = this.supabase();
    if (supabase) {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error || data.user?.email?.toLocaleLowerCase() !== email)
        throw new AuthError("验证码无效或已经过期", 401);
    } else {
      if (!isLoopback(request) || process.env.COF_BP_MODE === "shared")
        throw new AuthError("邮箱验证码服务尚未配置", 503);
      const row = this.connection
        .prepare(
          `SELECT * FROM auth_email_otps
           WHERE email = ? COLLATE NOCASE AND consumed_at IS NULL
             AND expires_at > ? ORDER BY created_at DESC LIMIT 1`
        )
        .get(email, new Date().toISOString()) as Row | undefined;
      if (!row || Number(row.attempts) >= Number(row.max_attempts))
        throw new AuthError("验证码无效或已经过期", 401);
      const valid = crypto.timingSafeEqual(
        Buffer.from(hashToken(`${email}|${token}`)),
        Buffer.from(String(row.token_hash))
      );
      if (!valid) {
        this.connection
          .prepare(
            "UPDATE auth_email_otps SET attempts = attempts + 1 WHERE id = ?"
          )
          .run(String(row.id));
        throw new AuthError("验证码无效或已经过期", 401);
      }
      this.connection
        .prepare("UPDATE auth_email_otps SET consumed_at = ? WHERE id = ?")
        .run(new Date().toISOString(), String(row.id));
    }
    return this.createSession(
      this.activateEmailIdentity(email, name),
      request,
      response
    );
  }

  updateProfile(
    userId: string,
    input: {
      name?: string;
      languagePreference?: UiLanguagePreference;
    }
  ) {
    const name = input.name === undefined ? null : normalizeName(input.name);
    if (input.name !== undefined && !name)
      throw new AuthError("姓名或昵称不能为空", 400);
    if (name === null && input.languagePreference === undefined)
      throw new AuthError("没有需要更新的账户信息", 400);
    const stamp = new Date().toISOString();
    const result = this.connection
      .prepare(
        `UPDATE collaboration_users
         SET name = COALESCE(?, name),
             language_preference = COALESCE(?, language_preference),
             updated_at = ?
         WHERE id = ? AND state = 'active'`
      )
      .run(name, input.languagePreference ?? null, stamp, userId);
    if (!result.changes) throw new AuthError("账号不存在或已停用", 404);
    return toUser(
      this.connection
        .prepare("SELECT * FROM collaboration_users WHERE id = ?")
        .get(userId) as Row
    );
  }

  getSession(request: Request) {
    const token = parse(request.headers.cookie ?? "")[SESSION_COOKIE];
    if (!token) return null;
    const current = new Date().toISOString();
    const row = this.connection
      .prepare(
        `
      SELECT u.* FROM auth_sessions s
      JOIN collaboration_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.state = 'active'
      LIMIT 1
    `
      )
      .get(hashToken(token), current) as Row | undefined;
    if (!row) return null;
    this.connection
      .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?")
      .run(current, hashToken(token));
    return toUser(row);
  }

  requireSession(request: Request, roles?: UserRole[]) {
    const user = this.getSession(request);
    if (!user) throw new AuthError("请先登录", 401);
    if (roles && !roles.includes(user.role))
      throw new AuthError("当前账号没有此操作权限", 403);
    return user;
  }

  login(email: string, password: string, request: Request, response: Response) {
    const normalizedEmail = email.trim().toLocaleLowerCase();
    const metadata = requestMetadata(request);
    const attemptKey = hashToken(
      `${metadata.ip ?? "unknown"}|${normalizedEmail}`
    );
    const current = new Date().toISOString();
    const attempt = this.connection
      .prepare("SELECT * FROM auth_login_attempts WHERE attempt_key = ?")
      .get(attemptKey) as Row | undefined;
    if (attempt?.blocked_until && String(attempt.blocked_until) > current) {
      throw new AuthError("登录尝试过多，请稍后再试", 429);
    }
    const row = this.connection
      .prepare(
        "SELECT * FROM collaboration_users WHERE email = ? COLLATE NOCASE LIMIT 1"
      )
      .get(normalizedEmail) as Row | undefined;
    if (
      !row ||
      String(row.state) !== "active" ||
      !verifyPassword(
        password,
        typeof row.password_hash === "string" ? row.password_hash : null
      )
    ) {
      const windowStarted =
        attempt &&
        Date.now() - new Date(String(attempt.window_started_at)).getTime() <
          15 * 60 * 1000
          ? String(attempt.window_started_at)
          : current;
      const failures =
        windowStarted === current ? 1 : Number(attempt?.failures ?? 0) + 1;
      const blockedUntil =
        failures >= 5
          ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
          : null;
      this.connection
        .prepare(
          `
        INSERT INTO auth_login_attempts(attempt_key, failures, window_started_at, blocked_until)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(attempt_key) DO UPDATE SET failures = excluded.failures, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until
      `
        )
        .run(attemptKey, failures, windowStarted, blockedUntil);
      throw new AuthError("邮箱或密码不正确", 401);
    }
    this.connection
      .prepare("DELETE FROM auth_login_attempts WHERE attempt_key = ?")
      .run(attemptKey);
    return this.createSession(toUser(row), request, response);
  }

  logout(request: Request, response: Response) {
    const token = parse(request.headers.cookie ?? "")[SESSION_COOKIE];
    if (token)
      this.connection
        .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
        .run(hashToken(token));
    response.setHeader(
      "Set-Cookie",
      serialize(SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      })
    );
  }

  createInvitation(input: {
    email: string;
    name: string;
    role: "internal" | "external";
    createdBy: string;
    baseUrl: string;
  }) {
    const email = input.email.trim().toLocaleLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
      throw new AuthError("请输入有效邮箱", 400);
    if (!input.name.trim()) throw new AuthError("姓名不能为空", 400);
    const existing = this.connection
      .prepare(
        "SELECT id, state FROM collaboration_users WHERE email = ? COLLATE NOCASE"
      )
      .get(email) as Row | undefined;
    if (existing && String(existing.state) === "active")
      throw new AuthError("该邮箱已是有效成员", 409);
    const rawToken = randomToken();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = isoAfterDays(7);
    this.connection
      .prepare(
        `
      INSERT INTO invitations(id, email, name, role, token_hash, state, expires_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `
      )
      .run(
        id,
        email,
        input.name.trim(),
        input.role,
        hashToken(rawToken),
        expiresAt,
        input.createdBy,
        createdAt
      );
    const inviteUrl = `${input.baseUrl.replace(/\/$/, "")}/invite/${rawToken}`;
    this.connection
      .prepare(
        `
      INSERT INTO email_outbox(id, recipient, template, payload_json, state, created_at)
      VALUES (?, ?, 'collaboration_invitation', ?, 'queued', ?)
    `
      )
      .run(
        crypto.randomUUID(),
        email,
        JSON.stringify({
          invitationId: id,
          name: input.name.trim(),
          inviteUrl,
        }),
        createdAt
      );
    return {
      id,
      email,
      name: input.name.trim(),
      role: input.role,
      state: "pending",
      expiresAt,
      createdAt,
      inviteUrl,
    } satisfies Invitation;
  }

  acceptInvitation(
    token: string,
    password: string,
    request: Request,
    response: Response
  ) {
    const current = new Date().toISOString();
    const invitation = this.connection
      .prepare(
        `
      SELECT * FROM invitations WHERE token_hash = ? AND state = 'pending' AND expires_at > ? LIMIT 1
    `
      )
      .get(hashToken(token), current) as Row | undefined;
    if (!invitation) throw new AuthError("邀请无效或已经过期", 400);
    const passwordHash = hashPassword(password);
    let userRow = this.connection
      .prepare(
        "SELECT * FROM collaboration_users WHERE email = ? COLLATE NOCASE LIMIT 1"
      )
      .get(String(invitation.email)) as Row | undefined;
    const userId = userRow ? String(userRow.id) : crypto.randomUUID();
    if (userRow) {
      this.connection
        .prepare(
          `
        UPDATE collaboration_users SET name = ?, role = ?, state = 'active', password_hash = ?, updated_at = ? WHERE id = ?
      `
        )
        .run(
          String(invitation.name),
          String(invitation.role),
          passwordHash,
          current,
          userId
        );
    } else {
      this.connection
        .prepare(
          `
        INSERT INTO collaboration_users(id, email, name, role, state, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `
        )
        .run(
          userId,
          String(invitation.email),
          String(invitation.name),
          String(invitation.role),
          passwordHash,
          current,
          current
        );
    }
    this.connection
      .prepare(
        "UPDATE invitations SET state = 'accepted', accepted_at = ? WHERE id = ?"
      )
      .run(current, String(invitation.id));
    userRow = this.connection
      .prepare("SELECT * FROM collaboration_users WHERE id = ?")
      .get(userId) as Row;
    return this.createSession(toUser(userRow), request, response);
  }

  listCollaborators() {
    return this.connection
      .prepare(
        `
      SELECT u.*, COUNT(pm.publication_id) AS grants
      FROM collaboration_users u
      LEFT JOIN publication_members pm ON pm.user_id = u.id
      GROUP BY u.id
      ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'internal' THEN 1 ELSE 2 END, u.created_at
    `
      )
      .all()
      .map(value => {
        const row = value as Row;
        return {
          ...toUser(row),
          createdAt: String(row.created_at),
          lastSignedInAt:
            typeof row.last_signed_in_at === "string"
              ? row.last_signed_in_at
              : null,
          grants: Number(row.grants),
        };
      });
  }

  listInvitations() {
    const current = new Date().toISOString();
    this.connection
      .prepare(
        "UPDATE invitations SET state = 'expired' WHERE state = 'pending' AND expires_at <= ?"
      )
      .run(current);
    return this.connection
      .prepare("SELECT * FROM invitations ORDER BY created_at DESC")
      .all()
      .map(value => {
        const row = value as Row;
        return {
          id: String(row.id),
          email: String(row.email),
          name: String(row.name),
          role: String(row.role),
          state: String(row.state),
          expiresAt: String(row.expires_at),
          createdAt: String(row.created_at),
          inviteUrl: null,
        } as Invitation;
      });
  }

  setUserState(userId: string, state: "active" | "suspended") {
    const user = this.connection
      .prepare("SELECT * FROM collaboration_users WHERE id = ?")
      .get(userId) as Row | undefined;
    if (!user) throw new AuthError("成员不存在", 404);
    if (String(user.role) === "admin")
      throw new AuthError("不能在成员列表中停用管理员", 400);
    this.connection
      .prepare(
        "UPDATE collaboration_users SET state = ?, updated_at = ? WHERE id = ?"
      )
      .run(state, new Date().toISOString(), userId);
    if (state === "suspended")
      this.connection
        .prepare("DELETE FROM auth_sessions WHERE user_id = ?")
        .run(userId);
    return toUser(
      this.connection
        .prepare("SELECT * FROM collaboration_users WHERE id = ?")
        .get(userId) as Row
    );
  }

  revokeInvitation(invitationId: string) {
    const result = this.connection
      .prepare(
        "UPDATE invitations SET state = 'revoked' WHERE id = ? AND state = 'pending'"
      )
      .run(invitationId);
    if (!result.changes) throw new AuthError("邀请不存在或当前不能撤销", 409);
  }
}

export const collaborationAuth = new CollaborationAuth();
