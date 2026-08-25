import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import {
  ITERATION_CAPABILITY_PACK_VERSION,
  type IterationCategory,
  type IterationClaimInput,
  type IterationClaimResult,
  type IterationCompleteInput,
  type IterationCreateInput,
  type IterationDecisionInput,
  type IterationEventDto,
  type IterationEventType,
  type IterationFinalizeInput,
  type IterationHeartbeatInput,
  type IterationHeartbeatResult,
  type IterationListInput,
  type IterationNeedsAttentionInput,
  type IterationOverviewDto,
  type IterationPreflightFinalizeInput,
  type IterationProgressInput,
  type IterationQuality,
  type IterationRequeueInput,
  type IterationResult,
  type IterationStatus,
  type IterationTaskDetailDto,
  type IterationTaskDto,
  iterationClaimInputSchema,
  iterationCompleteInputSchema,
  iterationCreateInputSchema,
  iterationDecisionInputSchema,
  iterationFinalizeInputSchema,
  iterationHeartbeatInputSchema,
  iterationIdInputSchema,
  iterationListInputSchema,
  iterationNeedsAttentionInputSchema,
  iterationPreflightFinalizeInputSchema,
  iterationProgressInputSchema,
  iterationRequeueInputSchema,
  iterationResultSchema,
} from "../../shared/iteration";
import { getDatabase, type LocalDatabase } from "./database";

type IterationRow = Record<string, unknown>;
type ActorKind = "human" | "codex" | "system";

export type IterationServiceErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "CORRUPT_DATA"
  | "LAUNCH_FAILED"
  | "GIT_HEAD_UNAVAILABLE"
  | "LEASE_EXPIRED";

export class IterationServiceError extends Error {
  constructor(
    readonly code: IterationServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "IterationServiceError";
  }
}

export type IterationServiceOptions = {
  clock?: () => string;
  idFactory?: () => string;
  launchCodex?: () => boolean;
  codexLaunchAvailable?: boolean;
  headRefResolver?: () => string;
  candidateRefVerifier?: (candidateRef: string) => boolean;
  candidateAncestryVerifier?: (
    baseRef: string,
    candidateRef: string
  ) => boolean;
  claimTokenFactory?: () => string;
  leaseDurationMs?: number;
  appVersion?: string;
  projectRoot?: string;
};

export type CreateIterationFromFeedbackInput = {
  sourceFeedbackId: string;
  description: string;
  category: IterationCategory;
  qualityMode?: IterationQuality;
  requestedBy: string;
};

const WORKING_STATUSES = new Set<IterationStatus>(["working", "checking"]);
const ACTIVE_STATUSES = new Set<IterationStatus>([
  "ready_for_codex",
  "working",
  "checking",
  "needs_attention",
  "ready",
  "approved",
]);
const DEFAULT_LEASE_DURATION_MS = 30 * 60 * 1_000;

function defaultCodexLauncher(projectRoot: string) {
  return () => {
    const scriptPath = path.resolve(projectRoot, "scripts", "start-codex.ps1");
    if (!fs.existsSync(scriptPath))
      throw new IterationServiceError(
        "LAUNCH_FAILED",
        "未找到 scripts/start-codex.ps1"
      );
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      {
        cwd: projectRoot,
        encoding: "utf8",
        windowsHide: true,
      }
    );
    if (result.error || result.status !== 0) {
      throw new IterationServiceError(
        "LAUNCH_FAILED",
        "Codex 启动失败，请确认桌面应用已安装并登录"
      );
    }
    return true;
  };
}

function readAppVersion(projectRoot: string) {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
    ) as { version?: unknown };
    if (typeof value.version === "string" && value.version.trim())
      return value.version.trim();
  } catch {
    // A missing package manifest must not silently produce a made-up version.
  }
  return "unknown";
}

function defaultHeadRefResolver(projectRoot: string) {
  return () => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      windowsHide: true,
    });
    const head = result.stdout.trim().toLowerCase();
    if (
      result.error ||
      result.status !== 0 ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(head)
    )
      throw new IterationServiceError(
        "GIT_HEAD_UNAVAILABLE",
        "无法核对当前 Git HEAD，任务暂不能归档"
      );
    return head;
  };
}

function defaultCandidateRefVerifier(projectRoot: string) {
  return (candidateRef: string) => {
    const result = spawnSync(
      "git",
      ["cat-file", "-e", `${candidateRef}^{commit}`],
      {
        cwd: projectRoot,
        encoding: "utf8",
        windowsHide: true,
      }
    );
    return !result.error && result.status === 0;
  };
}

function defaultCandidateAncestryVerifier(projectRoot: string) {
  return (baseRef: string, candidateRef: string) => {
    const result = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", baseRef, candidateRef],
      {
        cwd: projectRoot,
        encoding: "utf8",
        windowsHide: true,
      }
    );
    return !result.error && result.status === 0;
  };
}

function hashClaimToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeResolvedCommitRef(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(normalized))
    throw new IterationServiceError(
      "GIT_HEAD_UNAVAILABLE",
      "无法核对当前 Git HEAD，任务暂不能继续"
    );
  return normalized;
}

function claimTokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashClaimToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseResult(value: unknown): IterationResult | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return iterationResultSchema.parse(JSON.parse(value));
  } catch {
    throw new IterationServiceError(
      "CORRUPT_DATA",
      "迭代任务结果无法读取，请检查本地数据库"
    );
  }
}

function toTaskDto(row: IterationRow, currentTime: string): IterationTaskDto {
  const status = String(row.status) as IterationStatus;
  const leaseExpiresAt = nullableString(row.lease_expires_at);
  const currentTimeMs = Date.parse(currentTime);
  const leaseExpiresAtMs = leaseExpiresAt ? Date.parse(leaseExpiresAt) : NaN;
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.request_text),
    category: String(row.category) as IterationCategory,
    qualityMode: String(row.quality) as IterationQuality,
    status,
    currentRound: Number(row.round),
    requestedBy: String(row.requested_by),
    claimedBy: nullableString(row.claimed_by),
    canRequeue:
      WORKING_STATUSES.has(status) &&
      (!Number.isFinite(leaseExpiresAtMs) ||
        (Number.isFinite(currentTimeMs) && leaseExpiresAtMs <= currentTimeMs)),
    feedback: nullableString(row.feedback),
    result: parseResult(row.result_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toEventDto(row: IterationRow): IterationEventDto {
  return {
    id: Number(row.id),
    type: String(row.event_type) as IterationEventType,
    fromStatus: nullableString(row.from_status) as IterationStatus | null,
    toStatus: String(row.to_status) as IterationStatus,
    actorKind: String(row.actor_kind) as ActorKind,
    actorName: String(row.actor_name),
    round: Number(row.round),
    createdAt: String(row.created_at),
  };
}

export class IterationService {
  private readonly clock: () => string;
  private readonly idFactory: () => string;
  private readonly launchCodexProcess: () => boolean;
  private readonly codexLaunchAvailable: boolean;
  private readonly resolveHeadRef: () => string;
  private readonly verifyCandidateRef: (candidateRef: string) => boolean;
  private readonly verifyCandidateAncestry: (
    baseRef: string,
    candidateRef: string
  ) => boolean;
  private readonly claimTokenFactory: () => string;
  private readonly leaseDurationMs: number;
  private readonly appVersion: string;

  constructor(
    private readonly database: LocalDatabase = getDatabase(),
    options: IterationServiceOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => `iteration_${randomUUID()}`);
    const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    this.launchCodexProcess =
      options.launchCodex ?? defaultCodexLauncher(projectRoot);
    this.codexLaunchAvailable =
      options.codexLaunchAvailable ??
      (options.launchCodex
        ? true
        : fs.existsSync(path.join(projectRoot, "scripts", "start-codex.ps1")));
    this.resolveHeadRef =
      options.headRefResolver ?? defaultHeadRefResolver(projectRoot);
    this.verifyCandidateRef =
      options.candidateRefVerifier ?? defaultCandidateRefVerifier(projectRoot);
    this.verifyCandidateAncestry =
      options.candidateAncestryVerifier ??
      defaultCandidateAncestryVerifier(projectRoot);
    this.claimTokenFactory =
      options.claimTokenFactory ??
      (() => randomBytes(32).toString("base64url"));
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    if (!Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs < 10_000)
      throw new Error("迭代任务租约时长必须至少为 10 秒");
    this.appVersion = options.appVersion ?? readAppVersion(projectRoot);
  }

  private assertLocalMode() {
    if (process.env.COF_BP_MODE === "shared")
      throw new IterationServiceError(
        "FORBIDDEN",
        "共享部署不开放本地迭代任务接口"
      );
  }

  private rawTask(id: string) {
    return this.database.connection
      .prepare("SELECT * FROM iteration_tasks WHERE id = ?")
      .get(id) as IterationRow | undefined;
  }

  private requireTask(id: string) {
    const row = this.rawTask(id);
    if (!row) throw new IterationServiceError("NOT_FOUND", "迭代任务不存在");
    return row;
  }

  private toTaskDto(row: IterationRow) {
    return toTaskDto(row, this.clock());
  }

  private leaseExpiresAt(timestamp: string) {
    const current = Date.parse(timestamp);
    if (!Number.isFinite(current))
      throw new IterationServiceError("CORRUPT_DATA", "本地时钟无效");
    return new Date(current + this.leaseDurationMs).toISOString();
  }

  private requireActiveClaim(
    row: IterationRow,
    claimToken: string,
    timestamp: string
  ) {
    const status = String(row.status) as IterationStatus;
    if (!WORKING_STATUSES.has(status))
      throw new IterationServiceError(
        "CONFLICT",
        `任务当前状态为 ${status}，领取凭据已不可使用`
      );
    const tokenHash = nullableString(row.claim_token_hash);
    if (!tokenHash || !claimTokenMatches(claimToken, tokenHash))
      throw new IterationServiceError("CONFLICT", "迭代任务领取凭据无效");
    const expiresAt = nullableString(row.lease_expires_at);
    if (
      !expiresAt ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.parse(timestamp)
    )
      throw new IterationServiceError(
        "LEASE_EXPIRED",
        "迭代任务领取租约已过期，请先安全地重新排队"
      );
    return {
      status,
      actorName: nullableString(row.claimed_by) ?? "local-codex",
    };
  }

  private appendEvent(input: {
    taskId: string;
    type: IterationEventType;
    fromStatus: IterationStatus | null;
    toStatus: IterationStatus;
    actorKind: ActorKind;
    actorName: string;
    round: number;
    detail?: Record<string, unknown>;
    createdAt: string;
  }) {
    this.database.connection
      .prepare(
        `INSERT INTO iteration_task_events(
          task_id, event_type, from_status, to_status, actor_kind,
          actor_name, round, detail_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.taskId,
        input.type,
        input.fromStatus,
        input.toStatus,
        input.actorKind,
        input.actorName,
        input.round,
        JSON.stringify(input.detail ?? {}),
        input.createdAt
      );
  }

  overview(input: Partial<IterationListInput> = {}): IterationOverviewDto {
    this.assertLocalMode();
    const filters = iterationListInputSchema.parse(input);
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filters.status) {
      where.push("status = ?");
      values.push(filters.status);
    }
    if (filters.category) {
      where.push("category = ?");
      values.push(filters.category);
    }
    values.push(filters.limit);
    const rows = this.database.connection
      .prepare(
        `SELECT * FROM iteration_tasks
         ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`
      )
      .all(...values) as IterationRow[];
    return {
      version: {
        appVersion: this.appVersion,
        capabilityPackVersion: ITERATION_CAPABILITY_PACK_VERSION,
        codexLaunchAvailable: this.codexLaunchAvailable,
        directRunMode: "task_queue",
      },
      items: rows.map(row => this.toTaskDto(row)),
    };
  }

  get(id: string): IterationTaskDetailDto | null {
    this.assertLocalMode();
    const parsed = iterationIdInputSchema.parse({ id });
    const task = this.rawTask(parsed.id);
    if (!task) return null;
    const events = this.database.connection
      .prepare(
        "SELECT * FROM iteration_task_events WHERE task_id = ? ORDER BY id"
      )
      .all(parsed.id) as IterationRow[];
    return { task: this.toTaskDto(task), events: events.map(toEventDto) };
  }

  create(input: IterationCreateInput): IterationTaskDto {
    this.assertLocalMode();
    const value = iterationCreateInputSchema.parse(input);
    const id = this.idFactory();
    const timestamp = this.clock();
    const title = value.description.split(/\r?\n/u)[0].trim().slice(0, 160);
    return this.database.transaction(() => {
      this.database.connection
        .prepare(
          `INSERT INTO iteration_tasks(
            id, title, request_text, category, quality, status, round,
            requested_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'ready_for_codex', 1, ?, ?, ?)`
        )
        .run(
          id,
          title,
          value.description,
          value.category,
          value.qualityMode,
          value.requestedBy,
          timestamp,
          timestamp
        );
      this.appendEvent({
        taskId: id,
        type: "created",
        fromStatus: null,
        toStatus: "ready_for_codex",
        actorKind: "human",
        actorName: value.requestedBy,
        round: 1,
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(id));
    });
  }

  createFromFeedback(
    input: CreateIterationFromFeedbackInput
  ): IterationTaskDto {
    this.assertLocalMode();
    const sourceFeedbackId = input.sourceFeedbackId.trim();
    if (sourceFeedbackId.length < 8 || sourceFeedbackId.length > 160)
      throw new IterationServiceError("CORRUPT_DATA", "反馈关联标识不合法");
    const value = iterationCreateInputSchema.parse({
      description: input.description,
      category: input.category,
      qualityMode: input.qualityMode ?? "standard",
      requestedBy: input.requestedBy,
    });
    return this.database.transaction(() => {
      const existing = this.database.connection
        .prepare("SELECT * FROM iteration_tasks WHERE source_feedback_id = ?")
        .get(sourceFeedbackId) as IterationRow | undefined;
      if (existing) return this.toTaskDto(existing);

      const id = this.idFactory();
      const timestamp = this.clock();
      const title = value.description.split(/\r?\n/u)[0].trim().slice(0, 160);
      this.database.connection
        .prepare(
          `INSERT INTO iteration_tasks(
            id, title, request_text, category, quality, status, round,
            requested_by, source_feedback_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'ready_for_codex', 1, ?, ?, ?, ?)`
        )
        .run(
          id,
          title,
          value.description,
          value.category,
          value.qualityMode,
          value.requestedBy,
          sourceFeedbackId,
          timestamp,
          timestamp
        );
      this.appendEvent({
        taskId: id,
        type: "created",
        fromStatus: null,
        toStatus: "ready_for_codex",
        actorKind: "system",
        actorName: "product-feedback-inbox",
        round: 1,
        detail: { source: "product_feedback" },
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(id));
    });
  }

  claim(input: IterationClaimInput): IterationClaimResult | null {
    this.assertLocalMode();
    const value = iterationClaimInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = value.id
        ? this.rawTask(value.id)
        : (this.database.connection
            .prepare(
              `SELECT * FROM iteration_tasks
               WHERE status = 'ready_for_codex'
               ORDER BY created_at, id
               LIMIT 1`
            )
            .get() as IterationRow | undefined);
      if (!row) {
        if (value.id)
          throw new IterationServiceError("NOT_FOUND", "迭代任务不存在");
        return null;
      }
      const id = String(row.id);
      const status = String(row.status) as IterationStatus;
      if (status !== "ready_for_codex")
        throw new IterationServiceError(
          "CONFLICT",
          `任务当前状态为 ${status}，不能重复领取`
        );
      const timestamp = this.clock();
      const baseRef = normalizeResolvedCommitRef(this.resolveHeadRef());
      const claimToken = this.claimTokenFactory().trim();
      if (claimToken.length < 32 || claimToken.length > 256)
        throw new IterationServiceError(
          "CORRUPT_DATA",
          "无法生成安全的迭代任务领取凭据"
        );
      const leaseExpiresAt = this.leaseExpiresAt(timestamp);
      const update = this.database.connection
        .prepare(
          `UPDATE iteration_tasks
           SET status = 'working', claimed_by = ?, claimed_model = ?,
               base_ref = ?, claim_token_hash = ?, lease_expires_at = ?,
               claimed_at = ?, updated_at = ?
           WHERE id = ? AND status = 'ready_for_codex'`
        )
        .run(
          value.claimedBy,
          value.modelName ?? null,
          baseRef,
          hashClaimToken(claimToken),
          leaseExpiresAt,
          timestamp,
          timestamp,
          id
        );
      if (Number(update.changes) !== 1)
        throw new IterationServiceError("CONFLICT", "任务已被其他 Codex 领取");
      this.appendEvent({
        taskId: id,
        type: "claimed",
        fromStatus: "ready_for_codex",
        toStatus: "working",
        actorKind: "codex",
        actorName: value.claimedBy,
        round: Number(row.round),
        detail: value.modelName ? { modelName: value.modelName } : undefined,
        createdAt: timestamp,
      });
      return {
        task: this.toTaskDto(this.requireTask(id)),
        claimToken,
        leaseExpiresAt,
      };
    });
  }

  update(input: IterationProgressInput): IterationTaskDto {
    this.assertLocalMode();
    const value = iterationProgressInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireTask(value.id);
      const timestamp = this.clock();
      const claim = this.requireActiveClaim(row, value.claimToken, timestamp);
      const leaseExpiresAt = this.leaseExpiresAt(timestamp);
      this.database.connection
        .prepare(
          "UPDATE iteration_tasks SET status = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?"
        )
        .run(value.status, leaseExpiresAt, timestamp, value.id);
      this.appendEvent({
        taskId: value.id,
        type: "progress_updated",
        fromStatus: claim.status,
        toStatus: value.status,
        actorKind: "codex",
        actorName: claim.actorName,
        round: Number(row.round),
        detail: value.message ? { message: value.message } : undefined,
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(value.id));
    });
  }

  heartbeat(input: IterationHeartbeatInput): IterationHeartbeatResult {
    this.assertLocalMode();
    const value = iterationHeartbeatInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireTask(value.id);
      const timestamp = this.clock();
      const claim = this.requireActiveClaim(row, value.claimToken, timestamp);
      const leaseExpiresAt = this.leaseExpiresAt(timestamp);
      this.database.connection
        .prepare(
          "UPDATE iteration_tasks SET lease_expires_at = ?, updated_at = ? WHERE id = ?"
        )
        .run(leaseExpiresAt, timestamp, value.id);
      this.appendEvent({
        taskId: value.id,
        type: "progress_updated",
        fromStatus: claim.status,
        toStatus: claim.status,
        actorKind: "codex",
        actorName: claim.actorName,
        round: Number(row.round),
        detail: { kind: "lease_renewed", leaseExpiresAt },
        createdAt: timestamp,
      });
      return { ok: true, leaseExpiresAt };
    });
  }

  requeueExpired(input: IterationRequeueInput): IterationTaskDto {
    this.assertLocalMode();
    const value = iterationRequeueInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireTask(value.id);
      const fromStatus = String(row.status) as IterationStatus;
      if (!WORKING_STATUSES.has(fromStatus))
        throw new IterationServiceError(
          "CONFLICT",
          `任务当前状态为 ${fromStatus}，不需要重新排队`
        );
      const timestamp = this.clock();
      const expiresAt = nullableString(row.lease_expires_at);
      if (
        expiresAt &&
        Number.isFinite(Date.parse(expiresAt)) &&
        Date.parse(expiresAt) > Date.parse(timestamp)
      )
        throw new IterationServiceError(
          "CONFLICT",
          "迭代任务领取租约仍有效，不能提前重新排队"
        );
      this.database.connection
        .prepare(
          `UPDATE iteration_tasks
           SET status = 'ready_for_codex', claimed_by = NULL,
               claimed_model = NULL, claim_token_hash = NULL,
               lease_expires_at = NULL, claimed_at = NULL,
               base_ref = NULL, result_json = NULL, candidate_ref = NULL,
               applied_ref = NULL,
               updated_at = ?
           WHERE id = ?`
        )
        .run(timestamp, value.id);
      this.appendEvent({
        taskId: value.id,
        type: "revision_requested",
        fromStatus,
        toStatus: "ready_for_codex",
        actorKind: "human",
        actorName: value.requestedBy,
        round: Number(row.round),
        detail: { kind: "expired_lease_requeued" },
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(value.id));
    });
  }

  needsAttention(input: IterationNeedsAttentionInput): IterationTaskDto {
    this.assertLocalMode();
    const value = iterationNeedsAttentionInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireTask(value.id);
      const timestamp = this.clock();
      const claim = this.requireActiveClaim(row, value.claimToken, timestamp);
      this.database.connection
        .prepare(
          `UPDATE iteration_tasks
           SET status = 'needs_attention', claim_token_hash = NULL,
               lease_expires_at = NULL, updated_at = ?
           WHERE id = ?`
        )
        .run(timestamp, value.id);
      this.appendEvent({
        taskId: value.id,
        type: "needs_attention",
        fromStatus: claim.status,
        toStatus: "needs_attention",
        actorKind: "codex",
        actorName: claim.actorName,
        round: Number(row.round),
        detail: { message: value.message },
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(value.id));
    });
  }

  complete(input: IterationCompleteInput): IterationTaskDto {
    this.assertLocalMode();
    const value = iterationCompleteInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireTask(value.id);
      const timestamp = this.clock();
      const claim = this.requireActiveClaim(row, value.claimToken, timestamp);
      const baseRef = nullableString(row.base_ref);
      if (
        !baseRef ||
        value.candidateRef === baseRef ||
        !this.verifyCandidateRef(value.candidateRef) ||
        !this.verifyCandidateAncestry(baseRef, value.candidateRef)
      )
        throw new IterationServiceError(
          "CONFLICT",
          "候选提交必须是领取任务时基线之后可验证的新提交"
        );
      this.database.connection
        .prepare(
          `UPDATE iteration_tasks
           SET status = 'ready', claimed_model = ?, result_json = ?,
               candidate_ref = ?, claim_token_hash = NULL,
               lease_expires_at = NULL, updated_at = ?
           WHERE id = ?`
        )
        .run(
          value.modelName,
          JSON.stringify(value.result),
          value.candidateRef,
          timestamp,
          value.id
        );
      this.appendEvent({
        taskId: value.id,
        type: "result_submitted",
        fromStatus: claim.status,
        toStatus: "ready",
        actorKind: "codex",
        actorName: claim.actorName,
        round: Number(row.round),
        detail: {
          modelName: value.modelName,
          candidateRef: value.candidateRef,
          result: value.result,
        },
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(value.id));
    });
  }

  decide(input: IterationDecisionInput): IterationTaskDto {
    this.assertLocalMode();
    const value = iterationDecisionInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireTask(value.id);
      const fromStatus = String(row.status) as IterationStatus;
      const currentRound = Number(row.round);
      const timestamp = this.clock();
      let toStatus: IterationStatus;
      let eventType: IterationEventType;
      let nextRound = currentRound;

      if (value.action === "accept") {
        if (fromStatus !== "ready")
          throw new IterationServiceError(
            "CONFLICT",
            `任务当前状态为 ${fromStatus}，只有待验收结果可以通过`
          );
        if (!parseResult(row.result_json) || !nullableString(row.candidate_ref))
          throw new IterationServiceError(
            "CONFLICT",
            "任务缺少已冻结的候选结果，不能确认采用"
          );
        toStatus = "approved";
        eventType = "accepted";
        this.database.connection
          .prepare(
            `UPDATE iteration_tasks
             SET status = 'approved', feedback = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(value.note ?? null, timestamp, value.id);
      } else if (value.action === "revise") {
        if (fromStatus !== "ready" && fromStatus !== "needs_attention")
          throw new IterationServiceError(
            "CONFLICT",
            `任务当前状态为 ${fromStatus}，不能退回修改`
          );
        toStatus = "ready_for_codex";
        eventType = "revision_requested";
        nextRound += 1;
        this.database.connection
          .prepare(
            `UPDATE iteration_tasks
             SET status = 'ready_for_codex', round = ?, feedback = ?,
                 claimed_by = NULL, claimed_model = NULL, claimed_at = NULL,
                 claim_token_hash = NULL, lease_expires_at = NULL,
                 base_ref = NULL, result_json = NULL, candidate_ref = NULL,
                 applied_ref = NULL,
                 completed_at = NULL, updated_at = ?
             WHERE id = ?`
          )
          .run(nextRound, value.note ?? "", timestamp, value.id);
      } else {
        if (!ACTIVE_STATUSES.has(fromStatus))
          throw new IterationServiceError(
            "CONFLICT",
            `任务当前状态为 ${fromStatus}，不能暂停`
          );
        toStatus = "paused";
        eventType = "paused";
        this.database.connection
          .prepare(
            `UPDATE iteration_tasks
             SET status = 'paused', feedback = ?, claim_token_hash = NULL,
                 lease_expires_at = NULL, updated_at = ?
             WHERE id = ?`
          )
          .run(value.note ?? null, timestamp, value.id);
      }

      this.appendEvent({
        taskId: value.id,
        type: eventType,
        fromStatus,
        toStatus,
        actorKind: "human",
        actorName: value.decidedBy,
        round: nextRound,
        detail: value.note ? { feedback: value.note } : undefined,
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(value.id));
    });
  }

  preflightFinalize(input: IterationPreflightFinalizeInput) {
    this.assertLocalMode();
    const value = iterationPreflightFinalizeInputSchema.parse(input);
    const row = this.requireTask(value.id);
    const status = String(row.status) as IterationStatus;
    if (status !== "approved")
      throw new IterationServiceError(
        "CONFLICT",
        `任务当前状态为 ${status}，只有已通过任务可以执行合并前预检`
      );
    const storedCandidateRef = nullableString(row.candidate_ref);
    if (
      !storedCandidateRef ||
      value.candidateRef !== storedCandidateRef ||
      !this.verifyCandidateRef(storedCandidateRef)
    )
      throw new IterationServiceError(
        "CONFLICT",
        "候选提交与人工确认时冻结的版本不一致"
      );
    return { ok: true as const };
  }

  finalize(input: IterationFinalizeInput): IterationTaskDto {
    this.assertLocalMode();
    const value = iterationFinalizeInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireTask(value.id);
      const fromStatus = String(row.status) as IterationStatus;
      if (fromStatus !== "approved")
        throw new IterationServiceError(
          "CONFLICT",
          `任务当前状态为 ${fromStatus}，只有已通过任务可以归档完成`
        );
      if (!parseResult(row.result_json))
        throw new IterationServiceError(
          "CONFLICT",
          "任务缺少已验收结果，不能归档完成"
        );
      const candidateRef = nullableString(row.candidate_ref);
      if (!candidateRef)
        throw new IterationServiceError(
          "CONFLICT",
          "任务缺少批准时冻结的候选提交，不能归档完成"
        );
      const headRef = normalizeResolvedCommitRef(this.resolveHeadRef());
      if (
        value.appliedRef !== candidateRef ||
        headRef !== candidateRef ||
        !this.verifyCandidateRef(candidateRef)
      )
        throw new IterationServiceError(
          "CONFLICT",
          "批准的候选提交、appliedRef 与当前工作区 Git HEAD 不一致"
        );
      const actorName = nullableString(row.claimed_by) ?? "local-codex";
      const timestamp = this.clock();
      this.database.connection
        .prepare(
          `UPDATE iteration_tasks
           SET status = 'completed', applied_ref = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(value.appliedRef, timestamp, timestamp, value.id);
      this.appendEvent({
        taskId: value.id,
        type: "finalized",
        fromStatus: "approved",
        toStatus: "completed",
        actorKind: "codex",
        actorName,
        round: Number(row.round),
        detail: { appliedRef: value.appliedRef },
        createdAt: timestamp,
      });
      return this.toTaskDto(this.requireTask(value.id));
    });
  }

  openCodex() {
    this.assertLocalMode();
    return { launched: this.launchCodexProcess() };
  }
}

let defaultIterationService: IterationService | undefined;

export function getIterationService() {
  defaultIterationService ??= new IterationService();
  return defaultIterationService;
}
