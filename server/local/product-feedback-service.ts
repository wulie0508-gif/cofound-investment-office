import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type ProductFeedbackClaimInput,
  type ProductFeedbackClaimResult,
  type ProductFeedbackCloseMaintenanceInput,
  type ProductFeedbackCompleteInput,
  type ProductFeedbackCreateInput,
  type ProductFeedbackDetailDto,
  type ProductFeedbackDto,
  type ProductFeedbackEventDto,
  type ProductFeedbackEventType,
  type ProductFeedbackHandoffPayload,
  type ProductFeedbackHeartbeatInput,
  type ProductFeedbackIngestRemoteInput,
  type ProductFeedbackListInput,
  type ProductFeedbackMarkFailedInput,
  type ProductFeedbackMarkSyncedInput,
  type ProductFeedbackNeedsAttentionInput,
  type ProductFeedbackOutboxDto,
  type ProductFeedbackPendingOutboxInput,
  type ProductFeedbackProgressInput,
  type ProductFeedbackTriageInput,
  PRODUCT_FEEDBACK_CONTRACT_VERSION,
  productFeedbackClaimInputSchema,
  productFeedbackCloseMaintenanceInputSchema,
  productFeedbackCompleteInputSchema,
  productFeedbackCreateInputSchema,
  productFeedbackDiagnosisSchema,
  productFeedbackHandoffPayloadSchema,
  productFeedbackHeartbeatInputSchema,
  productFeedbackIdInputSchema,
  productFeedbackIngestRemoteInputSchema,
  productFeedbackListInputSchema,
  productFeedbackMarkFailedInputSchema,
  productFeedbackMarkSyncedInputSchema,
  productFeedbackNeedsAttentionInputSchema,
  productFeedbackPendingOutboxInputSchema,
  productFeedbackProgressInputSchema,
  productFeedbackTriageInputSchema,
} from "../../shared/product-feedback";
import { ITERATION_CAPABILITY_PACK_VERSION } from "../../shared/iteration";
import { getDatabase, type LocalDatabase } from "./database";
import {
  getIterationService,
  type IterationService,
} from "./iteration-service";

type Row = Record<string, unknown>;
type ActorKind = "human" | "codex" | "system";

export type ProductFeedbackServiceErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "CORRUPT_DATA"
  | "LEASE_EXPIRED";

export class ProductFeedbackServiceError extends Error {
  constructor(
    readonly code: ProductFeedbackServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ProductFeedbackServiceError";
  }
}

export type ProductFeedbackServiceOptions = {
  clock?: () => string;
  idFactory?: () => string;
  outboxIdFactory?: () => string;
  claimTokenFactory?: () => string;
  leaseDurationMs?: number;
  maintainerMode?: boolean;
  projectRoot?: string;
  appVersion?: string;
  capabilityPackVersion?: string;
};

const ACTIVE_DIAGNOSIS_STATUSES = new Set(["working", "checking"]);
const DEFAULT_LEASE_DURATION_MS = 30 * 60 * 1_000;

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function readAppVersion(projectRoot: string) {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
    ) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim())
      return parsed.version.trim();
  } catch {
    // A packaged build may omit package metadata; retain a clear safe value.
  }
  return "unknown";
}

function tokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashValue(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseDiagnosis(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    return productFeedbackDiagnosisSchema.parse(JSON.parse(value));
  } catch {
    throw new ProductFeedbackServiceError(
      "CORRUPT_DATA",
      "反馈诊断结果无法读取"
    );
  }
}

function parsePayload(value: unknown) {
  if (typeof value !== "string" || !value)
    throw new ProductFeedbackServiceError("CORRUPT_DATA", "反馈同步内容为空");
  try {
    return productFeedbackHandoffPayloadSchema.parse(JSON.parse(value));
  } catch {
    throw new ProductFeedbackServiceError(
      "CORRUPT_DATA",
      "反馈同步内容无法读取"
    );
  }
}

function toFeedbackDto(row: Row): ProductFeedbackDto {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    expectedOutcome: nullableString(row.expected_outcome),
    category: String(row.category) as ProductFeedbackDto["category"],
    impact: String(row.impact) as ProductFeedbackDto["impact"],
    source: String(row.source_kind) as ProductFeedbackDto["source"],
    status: String(row.diagnosis_status) as ProductFeedbackDto["status"],
    currentRound: Number(row.diagnosis_round),
    reporterName: String(row.reporter_name),
    claimedBy: nullableString(row.claimed_by),
    syncStatus: String(row.sync_status) as ProductFeedbackDto["syncStatus"],
    triageStatus: String(
      row.triage_status
    ) as ProductFeedbackDto["triageStatus"],
    diagnosis: parseDiagnosis(row.diagnosis_json),
    trialFixStatus: String(
      row.trial_fix_status
    ) as ProductFeedbackDto["trialFixStatus"],
    hasMaintenanceTask: Boolean(nullableString(row.maintainer_iteration_id)),
    maintainerNote: nullableString(row.maintainer_note),
    triagedBy: nullableString(row.triaged_by),
    triagedAt: nullableString(row.triaged_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toEventDto(row: Row): ProductFeedbackEventDto {
  return {
    id: Number(row.id),
    type: String(row.event_type) as ProductFeedbackEventType,
    actorKind: String(row.actor_kind) as ActorKind,
    actorName: String(row.actor_name),
    createdAt: String(row.created_at),
  };
}

function toOutboxDto(row: Row): ProductFeedbackOutboxDto {
  return {
    id: String(row.id),
    feedbackId: String(row.feedback_id),
    kind: String(row.kind) as ProductFeedbackOutboxDto["kind"],
    sequence: Number(row.sequence),
    payload: parsePayload(row.payload_json),
    status: String(row.status) as ProductFeedbackOutboxDto["status"],
    attemptCount: Number(row.attempt_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function sanitizeInternalError(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(
      /\b(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|password|passcode|secret|otp)\s*[:=]\s*[^\s,;]+/giu,
      "credential=[REDACTED]"
    )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1_000);
}

function maintenanceDescription(row: Row) {
  const diagnosis = parseDiagnosis(row.diagnosis_json);
  if (!diagnosis)
    throw new ProductFeedbackServiceError(
      "CONFLICT",
      "反馈尚未完成诊断，不能纳入正式维护"
    );
  const sections = [
    String(row.title),
    `问题：${String(row.description)}`,
    nullableString(row.expected_outcome)
      ? `期望结果：${String(row.expected_outcome)}`
      : null,
    `诊断摘要：${diagnosis.summary}`,
    diagnosis.proposedActions.length > 0
      ? `建议调整：${diagnosis.proposedActions.slice(0, 10).join("；")}`
      : null,
    diagnosis.openQuestions.length > 0
      ? `待确认：${diagnosis.openQuestions.slice(0, 10).join("；")}`
      : null,
  ].filter((value): value is string => Boolean(value));
  return sections.join("\n").slice(0, 8_000);
}

export class ProductFeedbackService {
  private readonly clock: () => string;
  private readonly idFactory: () => string;
  private readonly outboxIdFactory: () => string;
  private readonly claimTokenFactory: () => string;
  private readonly leaseDurationMs: number;
  private readonly maintainerMode: boolean;
  private readonly appVersion: string;
  private readonly capabilityPackVersion: string;

  constructor(
    private readonly database: LocalDatabase = getDatabase(),
    private readonly iterationService: IterationService = getIterationService(),
    options: ProductFeedbackServiceOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => `feedback_${randomUUID()}`);
    this.outboxIdFactory =
      options.outboxIdFactory ?? (() => `feedback_outbox_${randomUUID()}`);
    this.claimTokenFactory =
      options.claimTokenFactory ??
      (() => randomBytes(32).toString("base64url"));
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    if (!Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs < 10_000)
      throw new Error("反馈诊断租约时长必须至少为 10 秒");
    const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    this.maintainerMode =
      options.maintainerMode ?? fs.existsSync(path.join(projectRoot, ".git"));
    this.appVersion = options.appVersion?.trim() || readAppVersion(projectRoot);
    this.capabilityPackVersion =
      options.capabilityPackVersion?.trim() ||
      ITERATION_CAPABILITY_PACK_VERSION;
  }

  private assertLocalMode() {
    if (process.env.COF_BP_MODE === "shared")
      throw new ProductFeedbackServiceError(
        "FORBIDDEN",
        "共享部署不开放本地产品反馈接口"
      );
  }

  private assertMaintainerMode() {
    if (!this.maintainerMode)
      throw new ProductFeedbackServiceError(
        "FORBIDDEN",
        "当前安装不是产品维护端，不能执行集中维护操作"
      );
  }

  private rawFeedback(id: string) {
    return this.database.connection
      .prepare("SELECT * FROM product_feedback WHERE id = ?")
      .get(id) as Row | undefined;
  }

  private requireFeedback(id: string) {
    const row = this.rawFeedback(id);
    if (!row)
      throw new ProductFeedbackServiceError("NOT_FOUND", "产品反馈不存在");
    return row;
  }

  private leaseExpiresAt(timestamp: string) {
    const now = Date.parse(timestamp);
    if (!Number.isFinite(now))
      throw new ProductFeedbackServiceError("CORRUPT_DATA", "本地时钟无效");
    return new Date(now + this.leaseDurationMs).toISOString();
  }

  private requireActiveClaim(row: Row, token: string, timestamp: string) {
    const status = String(row.diagnosis_status);
    if (!ACTIVE_DIAGNOSIS_STATUSES.has(status))
      throw new ProductFeedbackServiceError(
        "CONFLICT",
        `反馈当前状态为 ${status}，领取凭据已不可使用`
      );
    const tokenHash = nullableString(row.claim_token_hash);
    if (!tokenHash || !tokenMatches(token, tokenHash))
      throw new ProductFeedbackServiceError("CONFLICT", "反馈诊断领取凭据无效");
    const expiresAt = nullableString(row.lease_expires_at);
    if (
      !expiresAt ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.parse(timestamp)
    )
      throw new ProductFeedbackServiceError(
        "LEASE_EXPIRED",
        "反馈诊断租约已过期，请重新领取"
      );
    return {
      status,
      actorName: nullableString(row.claimed_by) ?? "local-codex",
    };
  }

  private appendEvent(input: {
    feedbackId: string;
    type: ProductFeedbackEventType;
    actorKind: ActorKind;
    actorName: string;
    detail?: Record<string, unknown>;
    createdAt: string;
  }) {
    this.database.connection
      .prepare(
        `INSERT INTO product_feedback_events(
          feedback_id, event_type, actor_kind, actor_name, detail_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.feedbackId,
        input.type,
        input.actorKind,
        input.actorName,
        JSON.stringify(input.detail ?? {}),
        input.createdAt
      );
  }

  private insertOutbox(
    payload: ProductFeedbackHandoffPayload,
    localFeedbackId = payload.feedbackId
  ) {
    const parsed = productFeedbackHandoffPayloadSchema.parse(payload);
    const timestamp = this.clock();
    const serialized = JSON.stringify(parsed);
    this.database.connection
      .prepare(
        `INSERT INTO product_feedback_outbox(
          id, feedback_id, kind, sequence, payload_json, payload_sha256,
          status, attempt_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
      )
      .run(
        parsed.outboxId,
        localFeedbackId,
        parsed.kind,
        parsed.sequence,
        serialized,
        hashValue(serialized),
        timestamp,
        timestamp
      );
  }

  private nextOutboxSequence(feedbackId: string) {
    const row = this.database.connection
      .prepare(
        `SELECT MAX(sequence_value) AS max_sequence FROM (
           SELECT COALESCE(MAX(sequence), 0) AS sequence_value
           FROM product_feedback_outbox WHERE feedback_id = ?
           UNION ALL
           SELECT COALESCE(last_remote_sequence, 0) AS sequence_value
           FROM product_feedback WHERE id = ?
         )`
      )
      .get(feedbackId, feedbackId) as Row;
    return Number(row.max_sequence) + 1;
  }

  private enqueueMaintenanceUpdate(input: {
    row: Row;
    triageStatus: ProductFeedbackDto["triageStatus"];
    maintainerNote: string | null;
    maintenanceTaskId: string | null;
    maintainerName: string;
    timestamp: string;
  }) {
    const sequence = this.nextOutboxSequence(String(input.row.id));
    this.insertOutbox(
      {
        schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
        applicationVersion: this.appVersion,
        capabilityPackVersion: this.capabilityPackVersion,
        kind: "maintenance_update",
        outboxId: this.outboxIdFactory(),
        sequence,
        originKey: String(input.row.origin_key),
        feedbackId:
          nullableString(input.row.source_feedback_id) ?? String(input.row.id),
        round: Number(input.row.diagnosis_round),
        reporterName: String(input.row.reporter_name),
        title: String(input.row.title),
        description: String(input.row.description),
        expectedOutcome: nullableString(input.row.expected_outcome),
        category: String(input.row.category) as ProductFeedbackDto["category"],
        impact: String(input.row.impact) as ProductFeedbackDto["impact"],
        submittedAt: String(input.row.created_at),
        sourceUpdatedAt: input.timestamp,
        diagnosis: parseDiagnosis(input.row.diagnosis_json),
        trialFixStatus: String(
          input.row.trial_fix_status
        ) as ProductFeedbackDto["trialFixStatus"],
        triageStatus: input.triageStatus,
        maintainerNote: input.maintainerNote,
        maintenanceTaskId: input.maintenanceTaskId,
        maintainerName: input.maintainerName,
        maintenanceUpdatedAt: input.timestamp,
      },
      String(input.row.id)
    );
    return sequence;
  }

  private refreshSyncStatus(feedbackId: string, timestamp: string) {
    const counts = this.database.connection
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
         FROM product_feedback_outbox WHERE feedback_id = ?`
      )
      .get(feedbackId) as Row;
    const next =
      Number(counts.pending_count) > 0
        ? "pending"
        : Number(counts.failed_count) > 0
          ? "failed"
          : "synced";
    this.database.connection
      .prepare(
        "UPDATE product_feedback SET sync_status = ?, updated_at = ? WHERE id = ?"
      )
      .run(next, timestamp, feedbackId);
  }

  capabilities() {
    this.assertLocalMode();
    return { maintainerMode: this.maintainerMode };
  }

  list(input: Partial<ProductFeedbackListInput> = {}) {
    this.assertLocalMode();
    const filters = productFeedbackListInputSchema.parse(input);
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filters.status) {
      where.push("diagnosis_status = ?");
      values.push(filters.status);
    }
    if (filters.syncStatus) {
      where.push("sync_status = ?");
      values.push(filters.syncStatus);
    }
    if (filters.triageStatus) {
      where.push("triage_status = ?");
      values.push(filters.triageStatus);
    }
    if (filters.source) {
      where.push("source_kind = ?");
      values.push(filters.source);
    }
    values.push(filters.limit);
    const rows = this.database.connection
      .prepare(
        `SELECT * FROM product_feedback
         ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY updated_at DESC, id DESC LIMIT ?`
      )
      .all(...values) as Row[];
    return rows.map(toFeedbackDto);
  }

  get(id: string): ProductFeedbackDetailDto | null {
    this.assertLocalMode();
    const value = productFeedbackIdInputSchema.parse({ id });
    const feedback = this.rawFeedback(value.id);
    if (!feedback) return null;
    const events = this.database.connection
      .prepare(
        "SELECT * FROM product_feedback_events WHERE feedback_id = ? ORDER BY id"
      )
      .all(value.id) as Row[];
    return {
      feedback: toFeedbackDto(feedback),
      events: events.map(toEventDto),
    };
  }

  create(input: ProductFeedbackCreateInput): ProductFeedbackDto {
    this.assertLocalMode();
    const value = productFeedbackCreateInputSchema.parse(input);
    const id = this.idFactory();
    const outboxId = this.outboxIdFactory();
    const timestamp = this.clock();
    const title = value.description.split(/\r?\n/u)[0].trim().slice(0, 160);
    const originKey = `feedback:${id}`;
    const payload = productFeedbackHandoffPayloadSchema.parse({
      schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
      applicationVersion: this.appVersion,
      capabilityPackVersion: this.capabilityPackVersion,
      kind: "initial_submission",
      outboxId,
      sequence: 1,
      originKey,
      feedbackId: id,
      round: 1,
      reporterName: value.reporterName,
      title,
      description: value.description,
      expectedOutcome: value.expectedOutcome ?? null,
      category: value.category,
      impact: value.impact,
      submittedAt: timestamp,
      sourceUpdatedAt: timestamp,
      diagnosis: null,
      trialFixStatus: "not_attempted",
      triageStatus: null,
      maintainerNote: null,
      maintenanceTaskId: null,
      maintainerName: null,
      maintenanceUpdatedAt: null,
    });
    return this.database.transaction(() => {
      this.database.connection
        .prepare(
          `INSERT INTO product_feedback(
            id, origin_key, source_kind, source_feedback_id, title, description, expected_outcome,
            category, impact, diagnosis_status, diagnosis_round, reporter_name,
            trial_fix_status, sync_status, triage_status, created_at, updated_at
          ) VALUES (?, ?, 'local', ?, ?, ?, ?, ?, ?, 'ready_for_codex', 1, ?,
                    'not_attempted', 'pending', 'new', ?, ?)`
        )
        .run(
          id,
          originKey,
          id,
          title,
          value.description,
          value.expectedOutcome ?? null,
          value.category,
          value.impact,
          value.reporterName,
          timestamp,
          timestamp
        );
      this.insertOutbox(payload);
      this.appendEvent({
        feedbackId: id,
        type: "created",
        actorKind: "human",
        actorName: value.reporterName,
        detail: { outboxKind: "initial_submission" },
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(id));
    });
  }

  claim(input: ProductFeedbackClaimInput): ProductFeedbackClaimResult | null {
    this.assertLocalMode();
    const value = productFeedbackClaimInputSchema.parse(input);
    return this.database.transaction(() => {
      const timestamp = this.clock();
      const row = value.id
        ? this.rawFeedback(value.id)
        : (this.database.connection
            .prepare(
              `SELECT * FROM product_feedback
               WHERE source_kind = 'local' AND diagnosis_status = 'ready_for_codex'
               ORDER BY created_at, id LIMIT 1`
            )
            .get() as Row | undefined);
      if (!row) {
        if (value.id)
          throw new ProductFeedbackServiceError("NOT_FOUND", "产品反馈不存在");
        return null;
      }
      if (String(row.source_kind) !== "local")
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "远程反馈只能由维护者受理，不能在本机重新诊断"
        );
      const status = String(row.diagnosis_status);
      const lease = nullableString(row.lease_expires_at);
      const expired =
        ACTIVE_DIAGNOSIS_STATUSES.has(status) &&
        (!lease ||
          !Number.isFinite(Date.parse(lease)) ||
          Date.parse(lease) <= Date.parse(timestamp));
      if (status !== "ready_for_codex" && !expired)
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          `反馈当前状态为 ${status}，不能重复领取`
        );
      const claimToken = this.claimTokenFactory().trim();
      if (claimToken.length < 32 || claimToken.length > 256)
        throw new ProductFeedbackServiceError(
          "CORRUPT_DATA",
          "无法生成安全的反馈领取凭据"
        );
      const leaseExpiresAt = this.leaseExpiresAt(timestamp);
      this.database.connection
        .prepare(
          `UPDATE product_feedback
           SET diagnosis_status = 'working', claimed_by = ?, claimed_model = ?,
               claim_token_hash = ?, lease_expires_at = ?, claimed_at = ?,
               updated_at = ? WHERE id = ?`
        )
        .run(
          value.claimedBy,
          value.modelName,
          hashValue(claimToken),
          leaseExpiresAt,
          timestamp,
          timestamp,
          String(row.id)
        );
      this.appendEvent({
        feedbackId: String(row.id),
        type: "claimed",
        actorKind: "codex",
        actorName: value.claimedBy,
        detail: { modelName: value.modelName, recoveredExpired: expired },
        createdAt: timestamp,
      });
      return {
        feedback: toFeedbackDto(this.requireFeedback(String(row.id))),
        claimToken,
        leaseExpiresAt,
      };
    });
  }

  update(input: ProductFeedbackProgressInput): ProductFeedbackDto {
    this.assertLocalMode();
    const value = productFeedbackProgressInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireFeedback(value.id);
      const timestamp = this.clock();
      const claim = this.requireActiveClaim(row, value.claimToken, timestamp);
      this.database.connection
        .prepare(
          `UPDATE product_feedback SET diagnosis_status = ?, lease_expires_at = ?,
           updated_at = ? WHERE id = ?`
        )
        .run(value.status, this.leaseExpiresAt(timestamp), timestamp, value.id);
      this.appendEvent({
        feedbackId: value.id,
        type: "progress_updated",
        actorKind: "codex",
        actorName: claim.actorName,
        detail: value.message ? { message: value.message } : undefined,
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(value.id));
    });
  }

  heartbeat(input: ProductFeedbackHeartbeatInput) {
    this.assertLocalMode();
    const value = productFeedbackHeartbeatInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireFeedback(value.id);
      const timestamp = this.clock();
      this.requireActiveClaim(row, value.claimToken, timestamp);
      const leaseExpiresAt = this.leaseExpiresAt(timestamp);
      this.database.connection
        .prepare(
          "UPDATE product_feedback SET lease_expires_at = ?, updated_at = ? WHERE id = ?"
        )
        .run(leaseExpiresAt, timestamp, value.id);
      return { ok: true as const, leaseExpiresAt };
    });
  }

  needsAttention(input: ProductFeedbackNeedsAttentionInput) {
    this.assertLocalMode();
    const value = productFeedbackNeedsAttentionInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireFeedback(value.id);
      const timestamp = this.clock();
      const claim = this.requireActiveClaim(row, value.claimToken, timestamp);
      this.database.connection
        .prepare(
          `UPDATE product_feedback SET diagnosis_status = 'needs_attention',
           claim_token_hash = NULL, lease_expires_at = NULL, updated_at = ?
           WHERE id = ?`
        )
        .run(timestamp, value.id);
      this.appendEvent({
        feedbackId: value.id,
        type: "needs_attention",
        actorKind: "codex",
        actorName: claim.actorName,
        detail: { message: value.message },
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(value.id));
    });
  }

  complete(input: ProductFeedbackCompleteInput) {
    this.assertLocalMode();
    const value = productFeedbackCompleteInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireFeedback(value.id);
      const timestamp = this.clock();
      const claim = this.requireActiveClaim(row, value.claimToken, timestamp);
      const sequence = this.nextOutboxSequence(value.id);
      const outboxId = this.outboxIdFactory();
      this.database.connection
        .prepare(
          `UPDATE product_feedback
           SET diagnosis_status = 'ready', claimed_model = ?, diagnosis_json = ?,
               trial_fix_status = ?, sync_status = 'pending',
               claim_token_hash = NULL, lease_expires_at = NULL,
               diagnosed_at = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          value.modelName,
          JSON.stringify(value.diagnosis),
          value.trialFixStatus,
          timestamp,
          timestamp,
          value.id
        );
      const updated = this.requireFeedback(value.id);
      this.insertOutbox({
        schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
        applicationVersion: this.appVersion,
        capabilityPackVersion: this.capabilityPackVersion,
        kind: "diagnosis_update",
        outboxId,
        sequence,
        originKey: String(updated.origin_key),
        feedbackId: value.id,
        round: Number(updated.diagnosis_round),
        reporterName: String(updated.reporter_name),
        title: String(updated.title),
        description: String(updated.description),
        expectedOutcome: nullableString(updated.expected_outcome),
        category: String(updated.category) as ProductFeedbackDto["category"],
        impact: String(updated.impact) as ProductFeedbackDto["impact"],
        submittedAt: String(updated.created_at),
        sourceUpdatedAt: timestamp,
        diagnosis: value.diagnosis,
        trialFixStatus: value.trialFixStatus,
        triageStatus: null,
        maintainerNote: null,
        maintenanceTaskId: null,
        maintainerName: null,
        maintenanceUpdatedAt: null,
      });
      this.appendEvent({
        feedbackId: value.id,
        type: "diagnosis_completed",
        actorKind: "codex",
        actorName: claim.actorName,
        detail: { modelName: value.modelName, outboxSequence: sequence },
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(value.id));
    });
  }

  pendingOutbox(input: Partial<ProductFeedbackPendingOutboxInput> = {}) {
    this.assertLocalMode();
    const value = productFeedbackPendingOutboxInputSchema.parse(input);
    const rows = value.feedbackId
      ? (this.database.connection
          .prepare(
            `SELECT * FROM product_feedback_outbox
             WHERE feedback_id = ? AND status IN ('pending','failed')
             ORDER BY created_at, id LIMIT ?`
          )
          .all(value.feedbackId, value.limit) as Row[])
      : (this.database.connection
          .prepare(
            `SELECT * FROM product_feedback_outbox
             WHERE status IN ('pending','failed')
             ORDER BY created_at, id LIMIT ?`
          )
          .all(value.limit) as Row[]);
    return rows.map(toOutboxDto);
  }

  pendingOutboxForFeedback(feedbackId: string, limit = 50) {
    const { id } = productFeedbackIdInputSchema.parse({ id: feedbackId });
    this.requireFeedback(id);
    return this.pendingOutbox({ feedbackId: id, limit });
  }

  trackedOriginKeys() {
    this.assertLocalMode();
    return (
      this.database.connection
        .prepare(
          `SELECT id, origin_key FROM product_feedback
           WHERE source_kind = 'local' ORDER BY created_at DESC, id`
        )
        .all() as Row[]
    ).map(row => ({ id: String(row.id), originKey: String(row.origin_key) }));
  }

  markOutboxSynced(input: ProductFeedbackMarkSyncedInput) {
    this.assertLocalMode();
    const value = productFeedbackMarkSyncedInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.database.connection
        .prepare("SELECT * FROM product_feedback_outbox WHERE id = ?")
        .get(value.outboxId) as Row | undefined;
      if (!row)
        throw new ProductFeedbackServiceError("NOT_FOUND", "反馈同步项不存在");
      if (String(row.status) === "synced") {
        const storedRemoteRecordId = nullableString(row.remote_record_id);
        if (
          storedRemoteRecordId &&
          value.remoteRecordId &&
          storedRemoteRecordId !== value.remoteRecordId
        )
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            "反馈同步项已绑定其他远程记录"
          );
        return toOutboxDto(row);
      }
      const timestamp = this.clock();
      this.database.connection
        .prepare(
          `UPDATE product_feedback_outbox
           SET status = 'synced', attempt_count = attempt_count + 1,
               remote_record_id = COALESCE(?, remote_record_id), last_error = NULL,
               synced_at = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          value.remoteRecordId ?? null,
          timestamp,
          timestamp,
          value.outboxId
        );
      const feedbackId = String(row.feedback_id);
      this.refreshSyncStatus(feedbackId, timestamp);
      this.appendEvent({
        feedbackId,
        type: "outbox_synced",
        actorKind: "system",
        actorName: "feedback-sync",
        detail: { outboxKind: String(row.kind) },
        createdAt: timestamp,
      });
      return toOutboxDto(
        this.database.connection
          .prepare("SELECT * FROM product_feedback_outbox WHERE id = ?")
          .get(value.outboxId) as Row
      );
    });
  }

  markOutboxFailed(input: ProductFeedbackMarkFailedInput) {
    this.assertLocalMode();
    const value = productFeedbackMarkFailedInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.database.connection
        .prepare("SELECT * FROM product_feedback_outbox WHERE id = ?")
        .get(value.outboxId) as Row | undefined;
      if (!row)
        throw new ProductFeedbackServiceError("NOT_FOUND", "反馈同步项不存在");
      if (String(row.status) === "synced")
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "已同步反馈不能改记为失败"
        );
      const timestamp = this.clock();
      this.database.connection
        .prepare(
          `UPDATE product_feedback_outbox
           SET status = 'failed', attempt_count = attempt_count + 1,
               last_error = ?, updated_at = ? WHERE id = ?`
        )
        .run(sanitizeInternalError(value.error), timestamp, value.outboxId);
      const feedbackId = String(row.feedback_id);
      this.refreshSyncStatus(feedbackId, timestamp);
      this.appendEvent({
        feedbackId,
        type: "outbox_failed",
        actorKind: "system",
        actorName: "feedback-sync",
        detail: { outboxKind: String(row.kind) },
        createdAt: timestamp,
      });
      return toOutboxDto(
        this.database.connection
          .prepare("SELECT * FROM product_feedback_outbox WHERE id = ?")
          .get(value.outboxId) as Row
      );
    });
  }

  applyRemoteMaintenanceUpdate(input: ProductFeedbackIngestRemoteInput) {
    this.assertLocalMode();
    const value = productFeedbackIngestRemoteInputSchema.parse(input);
    if (value.payload.kind !== "maintenance_update")
      throw new ProductFeedbackServiceError(
        "CONFLICT",
        "本机状态回写只接受维护更新"
      );
    return this.database.transaction(() => {
      const row = this.database.connection
        .prepare("SELECT * FROM product_feedback WHERE origin_key = ?")
        .get(value.payload.originKey) as Row | undefined;
      if (!row || String(row.source_kind) !== "local")
        throw new ProductFeedbackServiceError(
          "NOT_FOUND",
          "维护更新未匹配到本机原始反馈"
        );
      const lastSequence = Number(row.last_remote_sequence ?? 0);
      const lastOutboxId = nullableString(row.last_remote_outbox_id);
      if (value.payload.sequence === lastSequence) {
        if (lastOutboxId !== value.payload.outboxId)
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            "维护更新序号与既有记录冲突"
          );
        if (
          nullableString(row.remote_record_id) &&
          String(row.remote_record_id) !== value.remoteRecordId
        )
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            "维护更新已绑定其他远程记录"
          );
        return toFeedbackDto(row);
      }
      const maxLocal = this.database.connection
        .prepare(
          "SELECT COALESCE(MAX(sequence), 0) AS max_sequence FROM product_feedback_outbox WHERE feedback_id = ?"
        )
        .get(String(row.id)) as Row;
      const expectedSequence =
        Math.max(lastSequence, Number(maxLocal.max_sequence)) + 1;
      if (value.payload.sequence !== expectedSequence)
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          `维护更新序号不连续，应为 ${expectedSequence}`
        );
      if (
        value.payload.feedbackId !==
          (nullableString(row.source_feedback_id) ?? String(row.id)) ||
        value.payload.title !== String(row.title) ||
        value.payload.description !== String(row.description) ||
        value.payload.expectedOutcome !==
          nullableString(row.expected_outcome) ||
        value.payload.category !== String(row.category) ||
        value.payload.impact !== String(row.impact) ||
        value.payload.reporterName !== String(row.reporter_name) ||
        value.payload.submittedAt !== String(row.created_at)
      )
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "维护更新试图改写原始反馈内容"
        );
      const timestamp = this.clock();
      this.database.connection
        .prepare(
          `UPDATE product_feedback
           SET triage_status = ?, maintainer_note = ?,
               maintainer_iteration_id = ?, triaged_by = ?, triaged_at = ?,
               remote_record_id = ?, last_remote_sequence = ?,
               last_remote_outbox_id = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          value.payload.triageStatus,
          value.payload.maintainerNote,
          value.payload.maintenanceTaskId,
          value.payload.maintainerName,
          value.payload.maintenanceUpdatedAt,
          value.remoteRecordId,
          value.payload.sequence,
          value.payload.outboxId,
          timestamp,
          String(row.id)
        );
      this.appendEvent({
        feedbackId: String(row.id),
        type:
          value.payload.triageStatus === "completed"
            ? "maintenance_completed"
            : "remote_ingested",
        actorKind: "system",
        actorName: "maintenance-status-sync",
        detail: {
          kind: value.payload.kind,
          sequence: value.payload.sequence,
        },
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(String(row.id)));
    });
  }

  ingestRemote(input: ProductFeedbackIngestRemoteInput) {
    this.assertLocalMode();
    this.assertMaintainerMode();
    const value = productFeedbackIngestRemoteInputSchema.parse(input);
    if (value.payload.kind === "maintenance_update")
      throw new ProductFeedbackServiceError(
        "CONFLICT",
        "维护回写不能重新进入维护收件箱"
      );
    return this.database.transaction(() => {
      const timestamp = this.clock();
      const existing = this.database.connection
        .prepare("SELECT * FROM product_feedback WHERE origin_key = ?")
        .get(value.payload.originKey) as Row | undefined;
      if (existing) {
        if (String(existing.source_kind) !== "remote")
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            "远程反馈键与本机反馈冲突"
          );
        const sourceFeedbackId =
          nullableString(existing.source_feedback_id) ??
          value.payload.feedbackId;
        if (sourceFeedbackId !== value.payload.feedbackId)
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            "远程反馈编号与既有记录冲突"
          );
        const lastSequence = Number(existing.last_remote_sequence ?? 0);
        const lastOutboxId = nullableString(existing.last_remote_outbox_id);
        if (value.payload.sequence < lastSequence)
          return toFeedbackDto(existing);
        if (value.payload.sequence === lastSequence) {
          if (lastOutboxId !== value.payload.outboxId)
            throw new ProductFeedbackServiceError(
              "CONFLICT",
              "远程反馈序号与既有记录冲突"
            );
          return toFeedbackDto(existing);
        }
        if (value.payload.sequence !== lastSequence + 1)
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            `远程反馈序号不连续，应为 ${lastSequence + 1}`
          );
        if (
          value.payload.title !== String(existing.title) ||
          value.payload.description !== String(existing.description) ||
          value.payload.expectedOutcome !==
            nullableString(existing.expected_outcome) ||
          value.payload.category !== String(existing.category) ||
          value.payload.impact !== String(existing.impact) ||
          value.payload.reporterName !== String(existing.reporter_name) ||
          value.payload.submittedAt !== String(existing.created_at)
        )
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            "远程诊断更新试图改写原始反馈内容"
          );
        const nextTriage =
          String(existing.triage_status) === "needs_info" &&
          value.payload.diagnosis
            ? "new"
            : String(existing.triage_status);
        this.database.connection
          .prepare(
            `UPDATE product_feedback
             SET title = ?, description = ?, expected_outcome = ?, category = ?,
                 impact = ?, diagnosis_status = ?, diagnosis_round = ?,
                 reporter_name = ?, diagnosis_json = ?, trial_fix_status = ?,
                 sync_status = 'synced', triage_status = ?, remote_record_id = ?,
                 last_remote_sequence = ?, last_remote_outbox_id = ?,
                 updated_at = ?, diagnosed_at = ? WHERE id = ?`
          )
          .run(
            value.payload.title,
            value.payload.description,
            value.payload.expectedOutcome,
            value.payload.category,
            value.payload.impact,
            value.payload.diagnosis ? "ready" : "awaiting_diagnosis",
            value.payload.round,
            value.payload.reporterName,
            value.payload.diagnosis
              ? JSON.stringify(value.payload.diagnosis)
              : null,
            value.payload.trialFixStatus,
            nextTriage,
            value.remoteRecordId,
            value.payload.sequence,
            value.payload.outboxId,
            timestamp,
            value.payload.diagnosis ? timestamp : null,
            String(existing.id)
          );
        this.appendEvent({
          feedbackId: String(existing.id),
          type: "remote_ingested",
          actorKind: "system",
          actorName: "maintenance-inbox",
          detail: {
            kind: value.payload.kind,
            sequence: value.payload.sequence,
          },
          createdAt: timestamp,
        });
        return toFeedbackDto(this.requireFeedback(String(existing.id)));
      }

      const id = this.idFactory();
      this.database.connection
        .prepare(
          `INSERT INTO product_feedback(
            id, origin_key, source_kind, source_feedback_id, title, description, expected_outcome,
            category, impact, diagnosis_status, diagnosis_round, reporter_name,
            diagnosis_json, trial_fix_status, sync_status, triage_status,
            remote_record_id, last_remote_sequence, last_remote_outbox_id,
            created_at, updated_at, diagnosed_at
          ) VALUES (?, ?, 'remote', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced',
                    'new', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          value.payload.originKey,
          value.payload.feedbackId,
          value.payload.title,
          value.payload.description,
          value.payload.expectedOutcome,
          value.payload.category,
          value.payload.impact,
          value.payload.diagnosis ? "ready" : "awaiting_diagnosis",
          value.payload.round,
          value.payload.reporterName,
          value.payload.diagnosis
            ? JSON.stringify(value.payload.diagnosis)
            : null,
          value.payload.trialFixStatus,
          value.remoteRecordId,
          value.payload.sequence,
          value.payload.outboxId,
          value.payload.submittedAt,
          timestamp,
          value.payload.diagnosis ? timestamp : null
        );
      this.appendEvent({
        feedbackId: id,
        type: "remote_ingested",
        actorKind: "system",
        actorName: "maintenance-inbox",
        detail: { kind: value.payload.kind, sequence: value.payload.sequence },
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(id));
    });
  }

  triage(input: ProductFeedbackTriageInput) {
    this.assertLocalMode();
    this.assertMaintainerMode();
    const value = productFeedbackTriageInputSchema.parse(input);
    if (value.action === "accept") {
      const row = this.requireFeedback(value.id);
      const currentTriage = String(row.triage_status);
      if (
        currentTriage === "accepted" &&
        nullableString(row.maintainer_iteration_id)
      )
        return toFeedbackDto(row);
      if (currentTriage !== "new" && currentTriage !== "needs_info")
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          `反馈当前维护状态为 ${currentTriage}，不能受理`
        );
      if (
        String(row.diagnosis_status) !== "ready" ||
        !parseDiagnosis(row.diagnosis_json)
      )
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "反馈尚未完成诊断，不能受理"
        );
      // IterationService owns its own transaction. Its source_feedback_id
      // uniqueness makes this retry-safe if the process stops before the
      // feedback transaction below commits.
      const iteration = this.iterationService.createFromFeedback({
        sourceFeedbackId: value.id,
        description: maintenanceDescription(row),
        category: String(row.category) as ProductFeedbackDto["category"],
        qualityMode: "standard",
        requestedBy: String(row.reporter_name),
      });
      return this.database.transaction(() => {
        const latest = this.requireFeedback(value.id);
        if (
          String(latest.triage_status) === "accepted" &&
          nullableString(latest.maintainer_iteration_id)
        )
          return toFeedbackDto(latest);
        if (
          !["new", "needs_info"].includes(String(latest.triage_status)) ||
          String(latest.diagnosis_status) !== "ready" ||
          !parseDiagnosis(latest.diagnosis_json)
        )
          throw new ProductFeedbackServiceError(
            "CONFLICT",
            "反馈状态已经变化，请重新确认后受理"
          );
        const timestamp = this.clock();
        this.database.connection
          .prepare(
            `UPDATE product_feedback SET triage_status = 'accepted',
             maintainer_iteration_id = ?, maintainer_note = ?, triaged_by = ?,
             triaged_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
          )
          .run(
            iteration.id,
            value.note ?? null,
            value.decidedBy,
            timestamp,
            timestamp,
            value.id
          );
        const acceptedRow = this.requireFeedback(value.id);
        const outboxSequence = this.enqueueMaintenanceUpdate({
          row: acceptedRow,
          triageStatus: "accepted",
          maintainerNote: value.note ?? null,
          maintenanceTaskId: iteration.id,
          maintainerName: value.decidedBy,
          timestamp,
        });
        this.appendEvent({
          feedbackId: value.id,
          type: "triage_changed",
          actorKind: "human",
          actorName: value.decidedBy,
          detail: { action: "accepted", outboxSequence },
          createdAt: timestamp,
        });
        this.appendEvent({
          feedbackId: value.id,
          type: "iteration_created",
          actorKind: "system",
          actorName: "maintenance-inbox",
          createdAt: timestamp,
        });
        return toFeedbackDto(this.requireFeedback(value.id));
      });
    }

    return this.database.transaction(() => {
      const row = this.requireFeedback(value.id);
      const currentTriage = String(row.triage_status);
      const timestamp = this.clock();
      if (
        String(row.diagnosis_status) !== "ready" ||
        !parseDiagnosis(row.diagnosis_json)
      )
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "Codex 诊断尚未完成，不能进入维护判断"
        );
      if (currentTriage === "accepted" || currentTriage === "completed")
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "已进入正式维护的反馈不能改为其他维护状态"
        );
      if (currentTriage === value.action) return toFeedbackDto(row);
      this.database.connection
        .prepare(
          `UPDATE product_feedback SET triage_status = ?, maintainer_note = ?,
           triaged_by = ?, triaged_at = ?, sync_status = 'pending',
           updated_at = ? WHERE id = ?`
        )
        .run(
          value.action,
          value.note ?? null,
          value.decidedBy,
          timestamp,
          timestamp,
          value.id
        );
      const updated = this.requireFeedback(value.id);
      const outboxSequence = this.enqueueMaintenanceUpdate({
        row: updated,
        triageStatus: value.action === "accept" ? "accepted" : value.action,
        maintainerNote: value.note ?? null,
        maintenanceTaskId: null,
        maintainerName: value.decidedBy,
        timestamp,
      });
      this.appendEvent({
        feedbackId: value.id,
        type: "triage_changed",
        actorKind: "human",
        actorName: value.decidedBy,
        detail: {
          action: value.action,
          note: value.note,
          outboxSequence,
        },
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(value.id));
    });
  }

  closeMaintenance(input: ProductFeedbackCloseMaintenanceInput) {
    this.assertLocalMode();
    this.assertMaintainerMode();
    const value = productFeedbackCloseMaintenanceInputSchema.parse(input);
    return this.database.transaction(() => {
      const row = this.requireFeedback(value.id);
      if (String(row.triage_status) === "completed") return toFeedbackDto(row);
      if (String(row.triage_status) !== "accepted")
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "只有已受理反馈可以关闭维护"
        );
      const iterationId = nullableString(row.maintainer_iteration_id);
      if (!iterationId)
        throw new ProductFeedbackServiceError(
          "CORRUPT_DATA",
          "已受理反馈缺少维护任务"
        );
      const iteration = this.iterationService.get(iterationId);
      if (!iteration || iteration.task.status !== "completed")
        throw new ProductFeedbackServiceError(
          "CONFLICT",
          "维护任务尚未完成，不能关闭反馈"
        );
      const timestamp = this.clock();
      this.database.connection
        .prepare(
          `UPDATE product_feedback SET triage_status = 'completed',
           maintainer_note = COALESCE(?, maintainer_note), triaged_by = ?,
           triaged_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
        )
        .run(
          value.note ?? null,
          value.decidedBy,
          timestamp,
          timestamp,
          value.id
        );
      const updated = this.requireFeedback(value.id);
      const outboxSequence = this.enqueueMaintenanceUpdate({
        row: updated,
        triageStatus: "completed",
        maintainerNote: nullableString(updated.maintainer_note),
        maintenanceTaskId: iterationId,
        maintainerName: value.decidedBy,
        timestamp,
      });
      this.appendEvent({
        feedbackId: value.id,
        type: "maintenance_completed",
        actorKind: "human",
        actorName: value.decidedBy,
        detail: { outboxSequence },
        createdAt: timestamp,
      });
      return toFeedbackDto(this.requireFeedback(value.id));
    });
  }
}

let defaultProductFeedbackService: ProductFeedbackService | undefined;

export function getProductFeedbackService() {
  defaultProductFeedbackService ??= new ProductFeedbackService();
  return defaultProductFeedbackService;
}
