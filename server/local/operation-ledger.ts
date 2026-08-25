import crypto from "node:crypto";
import {
  OPERATION_ACTOR_KINDS,
  OPERATION_STATUSES,
  OPERATION_TYPES,
  type OperationActor,
  type OperationError,
  type OperationEvent,
  type OperationListFilters,
  type OperationMetadata,
  type OperationMetadataValue,
  type OperationStatus,
  type OperationSummary,
  type OperationType,
} from "../../shared/operation-ledger";
import { getDatabase, type LocalDatabase } from "./database";

type Row = Record<string, unknown>;
type TerminalOperationStatus = Exclude<OperationStatus, "started">;

export type OperationLedgerOptions = {
  appVersion?: string;
  clock?: () => string;
};

export type StartOperationInput = {
  operationId?: string;
  operationType: OperationType;
  projectId?: string | null;
  fileHash?: string | null;
  actor: OperationActor;
  skill?: {
    name: string;
    version?: string | null;
  } | null;
  model?: string | null;
  promptVersion?: string | null;
  metadata?: OperationMetadata;
};

export type FinishOperationInput = {
  status: TerminalOperationStatus;
  model?: string | null;
  error?: OperationError | null;
  metadata?: OperationMetadata;
};

const TERMINAL_STATUSES = new Set<OperationStatus>([
  "succeeded",
  "failed",
  "partial",
  "cancelled",
]);

const FORBIDDEN_METADATA_KEYS = new Set([
  "authorization",
  "apikey",
  "body",
  "content",
  "cookie",
  "credential",
  "document",
  "documenttext",
  "extractedtext",
  "idtoken",
  "otp",
  "passcode",
  "password",
  "payload",
  "prompt",
  "prompttext",
  "raw",
  "rawtext",
  "refreshtoken",
  "secret",
  "sessiontoken",
  "sourcetext",
  "synctoken",
  "token",
  "verificationcode",
  "验证码",
]);

function normalizeMetadataKey(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\u4e00-\u9fff]/gu, "");
}

function assertSafeMetadataKey(value: string) {
  if (!value.trim() || value.length > 64 || /[\u0000-\u001f]/u.test(value))
    throw new Error("运维日志 metadata 包含非法字段名");
  const normalized = normalizeMetadataKey(value);
  if (
    FORBIDDEN_METADATA_KEYS.has(normalized) ||
    normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("content") ||
    normalized.endsWith("body") ||
    normalized.endsWith("text")
  )
    throw new Error(`运维日志禁止记录敏感字段：${value}`);
}

function redactSecrets(value: string) {
  return value
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(
      /\b(?:access[_-]?token|refresh[_-]?token|sync[_-]?token|api[_-]?key|password|passcode|secret|otp)\s*[:=]\s*[^\s,;]+/giu,
      match => `${match.split(/[:=]/u, 1)[0]}=[REDACTED]`
    )
    .replace(/(?:验证码|校验码)\s*[:：=]?\s*\d{4,8}/gu, "验证码=[REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/gu,
      "[REDACTED_JWT]"
    );
}

function sanitizeText(value: string, maxLength: number) {
  const withoutControls = value.replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,
    ""
  );
  const redacted = redactSecrets(withoutControls).trim();
  return redacted.length <= maxLength
    ? redacted
    : `${redacted.slice(0, Math.max(0, maxLength - 12))} [TRUNCATED]`;
}

function sanitizeMetadata(metadata: OperationMetadata | undefined) {
  let nodes = 0;
  const visit = (value: unknown, depth: number): OperationMetadataValue => {
    nodes += 1;
    if (nodes > 200) throw new Error("运维日志 metadata 超过 200 个节点");
    if (depth > 5) throw new Error("运维日志 metadata 嵌套过深");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        throw new Error("运维日志 metadata 只接受有限数值");
      return value;
    }
    if (typeof value === "string") return sanitizeText(value, 512);
    if (Array.isArray(value)) {
      if (value.length > 50)
        throw new Error("运维日志 metadata 数组最多 50 项");
      return value.map(item => visit(item, depth + 1));
    }
    if (
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => {
          assertSafeMetadataKey(key);
          return [key, visit(item, depth + 1)];
        })
      );
    }
    throw new Error("运维日志 metadata 只接受 JSON 值");
  };

  const result = (metadata ? visit(metadata, 0) : {}) as OperationMetadata;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 8 * 1024)
    throw new Error("运维日志 metadata 不得超过 8KB");
  return result;
}

function parseMetadata(value: unknown): OperationMetadata {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as OperationMetadata)
      : {};
  } catch {
    return {};
  }
}

function requiredIdentifier(value: string, label: string, maxLength = 160) {
  const normalized = sanitizeText(value, maxLength);
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\r\n]/u.test(normalized)
  )
    throw new Error(`${label} 不合法`);
  return normalized;
}

function optionalIdentifier(
  value: string | null | undefined,
  label: string,
  maxLength = 160
) {
  return value === null || value === undefined || value.trim() === ""
    ? null
    : requiredIdentifier(value, label, maxLength);
}

function validateFileHash(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = value.toLocaleLowerCase("en-US");
  if (!/^[a-f0-9]{64}$/u.test(normalized))
    throw new Error("fileHash 必须是 64 位 SHA-256");
  return normalized;
}

function assertIsoTimestamp(value: string) {
  if (!value || Number.isNaN(Date.parse(value)))
    throw new Error("运维日志时钟返回了非法时间");
  return value;
}

function mapEvent(row: Row): OperationEvent {
  return {
    id: Number(row.id),
    operationId: String(row.operation_id),
    operationType: String(row.operation_type) as OperationType,
    status: String(row.status) as OperationStatus,
    occurredAt: String(row.occurred_at),
    startedAt: String(row.started_at),
    finishedAt: typeof row.finished_at === "string" ? row.finished_at : null,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    fileHash: typeof row.file_sha256 === "string" ? row.file_sha256 : null,
    appVersion: String(row.app_version),
    actor: {
      kind: String(row.actor_kind) as OperationActor["kind"],
      id: String(row.actor_id),
      name: typeof row.actor_name === "string" ? row.actor_name : null,
    },
    skill:
      typeof row.skill_name === "string"
        ? {
            name: row.skill_name,
            version:
              typeof row.skill_version === "string" ? row.skill_version : null,
          }
        : null,
    model: typeof row.model_name === "string" ? row.model_name : null,
    promptVersion:
      typeof row.prompt_version === "string" ? row.prompt_version : null,
    error:
      typeof row.error_code === "string" ||
      typeof row.error_message === "string"
        ? {
            code:
              typeof row.error_code === "string" ? row.error_code : "UNKNOWN",
            message:
              typeof row.error_message === "string" ? row.error_message : "",
          }
        : null,
    metadata: parseMetadata(row.metadata_json),
  };
}

export class OperationLedger {
  private readonly appVersion: string;
  private readonly clock: () => string;

  constructor(
    private readonly database: LocalDatabase,
    options: OperationLedgerOptions = {}
  ) {
    this.appVersion = requiredIdentifier(
      options.appVersion ??
        process.env.COF_BP_APP_VERSION ??
        process.env.npm_package_version ??
        "development",
      "appVersion",
      64
    );
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  start(input: StartOperationInput) {
    if (!OPERATION_TYPES.includes(input.operationType))
      throw new Error("不支持的运维操作类型");
    if (!OPERATION_ACTOR_KINDS.includes(input.actor.kind))
      throw new Error("不支持的运维操作者类型");

    const operationId = requiredIdentifier(
      input.operationId ?? `op_${crypto.randomUUID()}`,
      "operationId",
      120
    );
    if (this.latestRow(operationId)) throw new Error("operationId 已存在");
    const occurredAt = assertIsoTimestamp(this.clock());
    return this.insert({
      operationId,
      operationType: input.operationType,
      status: "started",
      occurredAt,
      startedAt: occurredAt,
      finishedAt: null,
      projectId: optionalIdentifier(input.projectId, "projectId", 160),
      fileHash: validateFileHash(input.fileHash),
      appVersion: this.appVersion,
      actor: {
        kind: input.actor.kind,
        id: requiredIdentifier(input.actor.id, "actor.id", 160),
        name: optionalIdentifier(input.actor.name, "actor.name", 160),
      },
      skill: input.skill
        ? {
            name: requiredIdentifier(input.skill.name, "skill.name", 160),
            version: optionalIdentifier(
              input.skill.version,
              "skill.version",
              80
            ),
          }
        : null,
      model: optionalIdentifier(input.model, "model", 160),
      promptVersion: optionalIdentifier(
        input.promptVersion,
        "promptVersion",
        160
      ),
      error: null,
      metadata: sanitizeMetadata(input.metadata),
    });
  }

  finish(operationId: string, input: FinishOperationInput) {
    if (!TERMINAL_STATUSES.has(input.status))
      throw new Error("finish 只接受终态");
    const normalizedId = requiredIdentifier(operationId, "operationId", 120);
    const latest = this.latestRow(normalizedId);
    if (!latest) throw new Error("运维操作不存在");
    const previous = mapEvent(latest);
    if (TERMINAL_STATUSES.has(previous.status))
      throw new Error("运维操作已经结束");
    if (input.status === "failed" && !input.error)
      throw new Error("失败操作必须提供错误代码和安全摘要");

    const occurredAt = assertIsoTimestamp(this.clock());
    const metadata = sanitizeMetadata({
      ...previous.metadata,
      ...(input.metadata ?? {}),
    });
    const error = input.error
      ? {
          code: requiredIdentifier(input.error.code, "error.code", 80),
          message: sanitizeText(input.error.message, 1_000),
        }
      : null;

    return this.insert({
      ...previous,
      id: undefined,
      status: input.status,
      occurredAt,
      finishedAt: occurredAt,
      model: optionalIdentifier(input.model, "model", 160) ?? previous.model,
      error,
      metadata,
    });
  }

  succeed(operationId: string, metadata?: OperationMetadata) {
    return this.finish(operationId, { status: "succeeded", metadata });
  }

  fail(
    operationId: string,
    error: OperationError,
    metadata?: OperationMetadata
  ) {
    return this.finish(operationId, { status: "failed", error, metadata });
  }

  markPartial(
    operationId: string,
    error?: OperationError | null,
    metadata?: OperationMetadata
  ) {
    return this.finish(operationId, { status: "partial", error, metadata });
  }

  cancel(operationId: string, metadata?: OperationMetadata) {
    return this.finish(operationId, { status: "cancelled", metadata });
  }

  getOperation(operationId: string) {
    const events = this.listEvents(operationId);
    if (events.length === 0) return null;
    return {
      summary: {
        ...events.at(-1)!,
        eventCount: events.length,
      } satisfies OperationSummary,
      events,
    };
  }

  listEvents(operationId: string) {
    const normalizedId = requiredIdentifier(operationId, "operationId", 120);
    return this.database.connection
      .prepare(
        "SELECT * FROM operation_ledger WHERE operation_id = ? ORDER BY id"
      )
      .all(normalizedId)
      .map(row => mapEvent(row as Row));
  }

  listOperations(filters: OperationListFilters = {}): OperationSummary[] {
    if (
      filters.operationType &&
      !OPERATION_TYPES.includes(filters.operationType)
    )
      throw new Error("不支持的运维操作类型");
    if (filters.status && !OPERATION_STATUSES.includes(filters.status))
      throw new Error("不支持的运维操作状态");

    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    if (filters.operationType) {
      conditions.push("latest.operation_type = ?");
      parameters.push(filters.operationType);
    }
    if (filters.status) {
      conditions.push("latest.status = ?");
      parameters.push(filters.status);
    }
    if (filters.projectId) {
      conditions.push("latest.project_id = ?");
      parameters.push(requiredIdentifier(filters.projectId, "projectId", 160));
    }
    if (filters.beforeId !== undefined) {
      if (!Number.isSafeInteger(filters.beforeId) || filters.beforeId <= 0)
        throw new Error("beforeId 不合法");
      conditions.push("latest.id < ?");
      parameters.push(filters.beforeId);
    }
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    parameters.push(limit);

    return this.database.connection
      .prepare(
        `WITH grouped AS (
           SELECT operation_id, MAX(id) AS latest_id, COUNT(*) AS event_count
           FROM operation_ledger
           GROUP BY operation_id
         )
         SELECT latest.*, grouped.event_count
         FROM grouped
         JOIN operation_ledger latest ON latest.id = grouped.latest_id
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY latest.id DESC
         LIMIT ?`
      )
      .all(...parameters)
      .map(row => ({
        ...mapEvent(row as Row),
        eventCount: Number((row as Row).event_count),
      }));
  }

  private latestRow(operationId: string) {
    return this.database.connection
      .prepare(
        "SELECT * FROM operation_ledger WHERE operation_id = ? ORDER BY id DESC LIMIT 1"
      )
      .get(operationId) as Row | undefined;
  }

  private insert(input: Omit<OperationEvent, "id"> & { id?: undefined }) {
    const result = this.database.connection
      .prepare(
        `INSERT INTO operation_ledger(
          operation_id, operation_type, status, occurred_at, started_at, finished_at,
          project_id, file_sha256, app_version, actor_kind, actor_id, actor_name,
          skill_name, skill_version, model_name, prompt_version,
          error_code, error_message, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.operationId,
        input.operationType,
        input.status,
        input.occurredAt,
        input.startedAt,
        input.finishedAt,
        input.projectId,
        input.fileHash,
        input.appVersion,
        input.actor.kind,
        input.actor.id,
        input.actor.name ?? null,
        input.skill?.name ?? null,
        input.skill?.version ?? null,
        input.model,
        input.promptVersion,
        input.error?.code ?? null,
        input.error?.message ?? null,
        JSON.stringify(input.metadata)
      );
    const row = this.database.connection
      .prepare("SELECT * FROM operation_ledger WHERE id = ?")
      .get(result.lastInsertRowid) as Row | undefined;
    if (!row) throw new Error("运维日志写入失败");
    return mapEvent(row);
  }
}

let defaultLedger: OperationLedger | undefined;

export function getOperationLedger() {
  defaultLedger ??= new OperationLedger(getDatabase());
  return defaultLedger;
}
