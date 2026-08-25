import { createHash } from "node:crypto";
import path from "node:path";
import {
  FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES as FIELDS,
  FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION,
  type FeishuFeedbackAdapterErrorCode,
  type FeishuMaintenanceInboxSnapshot,
  type FeishuProductFeedbackConfig,
  type FeishuProductFeedbackSyncReceipt,
  type FeishuReporterMaintenanceSnapshot,
} from "../../shared/feishu-feedback";
import {
  productFeedbackHandoffPayloadSchema,
  type ProductFeedbackHandoffPayload,
} from "../../shared/product-feedback";
import {
  runCheckedLarkCli,
  SpawnLarkCliRunner,
  verifyLarkUserAuthentication,
  type LarkCliRunner,
} from "./feishu-sync";

type JsonObject = Record<string, unknown>;

type BaseRecord = {
  id: string;
  fields: JsonObject;
};

const MAX_FROZEN_PAYLOAD_BYTES = 80 * 1024;
const PAGE_SIZE = 200;
const MAX_PAGES = 1_000;
const READ_BACK_DELAYS_MS = [100, 300, 800, 1_600] as const;

export class FeishuFeedbackAdapterError extends Error {
  readonly code: FeishuFeedbackAdapterErrorCode;

  constructor(code: FeishuFeedbackAdapterErrorCode) {
    super(code);
    this.name = "FeishuFeedbackAdapterError";
    this.code = code;
  }
}

function fail(code: FeishuFeedbackAdapterErrorCode): never {
  throw new FeishuFeedbackAdapterError(code);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dataOf(payload: JsonObject) {
  return isObject(payload.data) ? payload.data : {};
}

function validateConfig(config: FeishuProductFeedbackConfig) {
  if (
    !config.baseToken.trim() ||
    !config.tableId.trim() ||
    /\s/u.test(config.baseToken) ||
    /^https?:\/\//iu.test(config.baseToken) ||
    /^https?:\/\//iu.test(config.tableId)
  )
    fail("not_configured");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])])
    );
  return value;
}

function frozenPayload(input: unknown) {
  const parsed = productFeedbackHandoffPayloadSchema.safeParse(input);
  if (!parsed.success) fail("invalid_payload");
  const serialized = JSON.stringify(canonicalize(parsed.data));
  if (Buffer.byteLength(serialized, "utf8") > MAX_FROZEN_PAYLOAD_BYTES)
    fail("invalid_payload");
  return {
    payload: parsed.data,
    serialized,
    fingerprint: createHash("sha256").update(serialized).digest("hex"),
  };
}

function extractFieldSchema(payload: JsonObject) {
  const data = dataOf(payload);
  const values = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.fields)
      ? data.fields
      : [];
  return new Map(
    values.flatMap(value => {
      if (!isObject(value)) return [];
      const name =
        typeof value.field_name === "string"
          ? value.field_name
          : typeof value.name === "string"
            ? value.name
            : null;
      const type = typeof value.type === "string" ? value.type : null;
      return name ? ([[name, type]] as const) : [];
    })
  );
}

function extractBaseRecords(payload: JsonObject): BaseRecord[] {
  const data = dataOf(payload);
  const values = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.records)
      ? data.records
      : isObject(data.record)
        ? [data.record]
        : Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.records)
            ? payload.records
            : isObject(payload.record)
              ? [payload.record]
              : [];
  const objectRecords = values.flatMap(value => {
    if (!isObject(value)) return [];
    const id =
      typeof value.record_id === "string"
        ? value.record_id
        : typeof value.id === "string"
          ? value.id
          : null;
    if (!id) return [];
    return [{ id, fields: isObject(value.fields) ? value.fields : value }];
  });
  if (objectRecords.length > 0) return objectRecords;

  const rows = data.data;
  const fieldNames = data.fields;
  const recordIds = data.record_id_list;
  if (
    !Array.isArray(rows) ||
    !Array.isArray(fieldNames) ||
    !Array.isArray(recordIds)
  )
    return [];
  return rows.flatMap((row, rowIndex) => {
    const id = recordIds[rowIndex];
    if (typeof id !== "string" || !Array.isArray(row)) return [];
    const fields: JsonObject = {};
    fieldNames.forEach((field, fieldIndex) => {
      if (typeof field === "string") fields[field] = row[fieldIndex];
    });
    return [{ id, fields }];
  });
}

function fieldText(record: BaseRecord, field: string) {
  const value = record.fields[field];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (isObject(value) && typeof value.text === "string") return value.text;
  return null;
}

function fieldNumber(record: BaseRecord, field: string) {
  const value = record.fields[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const shanghaiDatetimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatShanghaiDatetime(date: Date) {
  const parts = Object.fromEntries(
    shanghaiDatetimeFormatter
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatDatetime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail("invalid_payload");
  return formatShanghaiDatetime(date);
}

function fieldDatetime(record: BaseRecord, field: string) {
  const raw = record.fields[field];
  const text = fieldText(record, field)?.trim();
  if (text && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(text)) return text;
  const numeric =
    typeof raw === "number"
      ? raw
      : text && /^\d+$/u.test(text)
        ? Number(text)
        : null;
  if (numeric !== null && Number.isFinite(numeric)) {
    const milliseconds = numeric < 100_000_000_000 ? numeric * 1_000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : formatShanghaiDatetime(date);
  }
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : formatShanghaiDatetime(date);
}

function listText(values: string[]) {
  return values.length ? values.map(value => `- ${value}`).join("\n") : null;
}

function sourceFields(
  payload: ProductFeedbackHandoffPayload,
  serialized: string,
  fingerprint: string
) {
  const fields: JsonObject = {
    [FIELDS.collaborationKey]: payload.originKey,
    [FIELDS.feedbackId]: payload.feedbackId,
    [FIELDS.latestOutboxId]: payload.outboxId,
    [FIELDS.handoffFingerprint]: fingerprint,
    [FIELDS.frozenPayload]: serialized,
    [FIELDS.handoffKind]: payload.kind,
    [FIELDS.applicationVersion]: payload.applicationVersion,
    [FIELDS.capabilityPackVersion]: payload.capabilityPackVersion,
    [FIELDS.sequence]: payload.sequence,
    [FIELDS.round]: payload.round,
    [FIELDS.reporterName]: payload.reporterName,
    [FIELDS.title]: payload.title,
    [FIELDS.description]: payload.description,
    [FIELDS.expectedOutcome]: payload.expectedOutcome,
    [FIELDS.category]: payload.category,
    [FIELDS.impact]: payload.impact,
    [FIELDS.submittedAt]: formatDatetime(payload.submittedAt),
    [FIELDS.diagnosisSummary]: payload.diagnosis?.summary ?? null,
    [FIELDS.proposedActions]: payload.diagnosis
      ? listText(payload.diagnosis.proposedActions)
      : null,
    [FIELDS.diagnosisChecks]: payload.diagnosis
      ? listText(
          payload.diagnosis.checks.map(
            check => `${check.label} [${check.status}] ${check.summary}`
          )
        )
      : null,
    [FIELDS.diagnosisRisks]: payload.diagnosis
      ? listText(payload.diagnosis.risks)
      : null,
    [FIELDS.openQuestions]: payload.diagnosis
      ? listText(payload.diagnosis.openQuestions)
      : null,
    [FIELDS.trialFixStatus]: payload.trialFixStatus,
    [FIELDS.sourceUpdatedAt]: formatDatetime(payload.sourceUpdatedAt),
  };
  if (payload.kind === "maintenance_update") {
    fields[FIELDS.processingStatus] = payload.triageStatus;
    fields[FIELDS.maintainerReply] = payload.maintainerNote;
    fields[FIELDS.maintainerName] = payload.maintainerName;
    fields[FIELDS.maintenanceTaskId] = payload.maintenanceTaskId;
    fields[FIELDS.maintenanceUpdatedAt] = payload.maintenanceUpdatedAt
      ? formatDatetime(payload.maintenanceUpdatedAt)
      : null;
  }
  return fields;
}

function extractRecordId(payload: JsonObject) {
  for (const container of [dataOf(payload), payload]) {
    if (typeof container.record_id === "string") return container.record_id;
    if (isObject(container.record)) {
      if (typeof container.record.record_id === "string")
        return container.record.record_id;
      if (typeof container.record.id === "string") return container.record.id;
      const ids = container.record.record_id_list;
      if (Array.isArray(ids) && typeof ids[0] === "string") return ids[0];
      if (typeof ids === "string") return ids;
    }
  }
  return null;
}

async function checkedRead(runner: LarkCliRunner, args: string[], cwd: string) {
  try {
    return await runCheckedLarkCli(runner, args, cwd);
  } catch (error) {
    if (error instanceof FeishuFeedbackAdapterError) throw error;
    fail("remote_read_failed");
  }
}

async function checkedWrite(
  runner: LarkCliRunner,
  args: string[],
  cwd: string
) {
  try {
    return await runCheckedLarkCli(runner, args, cwd);
  } catch (error) {
    if (error instanceof FeishuFeedbackAdapterError) throw error;
    fail("remote_write_failed");
  }
}

async function validateSchema(
  config: FeishuProductFeedbackConfig,
  runner: LarkCliRunner,
  cwd: string
) {
  let payload: JsonObject;
  try {
    payload = await runCheckedLarkCli(
      runner,
      [
        "base",
        "+field-list",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        config.tableId,
        "--limit",
        "200",
        "--format",
        "json",
      ],
      cwd
    );
  } catch {
    fail("schema_mismatch");
  }
  const fields = extractFieldSchema(payload);
  const invalid = FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION.filter(
    field => !fields.has(field.name) || fields.get(field.name) !== field.type
  );
  if (invalid.length > 0) fail("schema_mismatch");
}

export async function preflightFeishuProductFeedback(
  config: FeishuProductFeedbackConfig,
  options: { runner?: LarkCliRunner; cwd?: string } = {}
) {
  validateConfig(config);
  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  try {
    await verifyLarkUserAuthentication(runner, cwd);
  } catch {
    fail("auth_unavailable");
  }
  await validateSchema(config, runner, cwd);
  return { status: "ready" as const };
}

const collaborationLocks = new Map<string, Promise<void>>();

export async function withFeishuFeedbackCollaborationLock<T>(
  baseToken: string,
  collaborationKey: string,
  operation: () => Promise<T>
) {
  const lockKey = `${baseToken}:${collaborationKey}`;
  const previous = collaborationLocks.get(lockKey) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  collaborationLocks.set(lockKey, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (collaborationLocks.get(lockKey) === queued)
      collaborationLocks.delete(lockKey);
  }
}

const projectedFieldArgs = FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION.flatMap(
  field => ["--field-id", field.name]
);

async function findByCollaborationKey(
  config: FeishuProductFeedbackConfig,
  collaborationKey: string,
  runner: LarkCliRunner,
  cwd: string
) {
  const payload = await checkedRead(
    runner,
    [
      "base",
      "+record-list",
      "--as",
      "user",
      "--base-token",
      config.baseToken,
      "--table-id",
      config.tableId,
      ...projectedFieldArgs,
      "--filter-json",
      JSON.stringify({
        logic: "and",
        conditions: [[FIELDS.collaborationKey, "==", collaborationKey]],
      }),
      "--limit",
      "2",
      "--format",
      "json",
    ],
    cwd
  );
  const records = extractBaseRecords(payload);
  if (records.length > 1) fail("duplicate_collaboration_key");
  return records[0] ?? null;
}

function verifySourceReadBack(
  record: BaseRecord,
  expected: JsonObject,
  collaborationKey: string
) {
  for (const field of FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION) {
    if (!(field.name in expected)) continue;
    const expectedValue = expected[field.name];
    if (expectedValue === null || expectedValue === undefined) {
      const actual = record.fields[field.name];
      if (actual !== null && actual !== undefined && actual !== "")
        fail("readback_failed");
      continue;
    }
    if (field.type === "number") {
      if (fieldNumber(record, field.name) !== expectedValue)
        fail("readback_failed");
      continue;
    }
    if (field.type === "datetime") {
      if (fieldDatetime(record, field.name) !== expectedValue)
        fail("readback_failed");
      continue;
    }
    if (fieldText(record, field.name) !== String(expectedValue))
      fail("readback_failed");
  }
  if (fieldText(record, FIELDS.collaborationKey) !== collaborationKey)
    fail("readback_failed");
}

function verifyExistingFrozenPayload(
  record: BaseRecord,
  incoming: ReturnType<typeof frozenPayload>
) {
  const storedSerialized = fieldText(record, FIELDS.frozenPayload);
  const storedFingerprint = fieldText(record, FIELDS.handoffFingerprint);
  if (!storedSerialized || !storedFingerprint) fail("payload_conflict");
  if (
    createHash("sha256").update(storedSerialized).digest("hex") !==
    storedFingerprint
  )
    fail("payload_conflict");
  let stored: ReturnType<typeof frozenPayload>;
  try {
    stored = frozenPayload(JSON.parse(storedSerialized) as unknown);
  } catch {
    fail("payload_conflict");
  }
  if (stored.fingerprint !== storedFingerprint) fail("payload_conflict");
  if (stored.payload.originKey !== incoming.payload.originKey)
    fail("payload_conflict");
  if (stored.payload.feedbackId !== incoming.payload.feedbackId)
    fail("payload_conflict");
  if (stored.payload.submittedAt !== incoming.payload.submittedAt)
    fail("payload_conflict");
  return stored;
}

async function readRecord(
  config: FeishuProductFeedbackConfig,
  recordId: string,
  runner: LarkCliRunner,
  cwd: string
) {
  const payload = await checkedRead(
    runner,
    [
      "base",
      "+record-get",
      "--as",
      "user",
      "--base-token",
      config.baseToken,
      "--table-id",
      config.tableId,
      "--record-id",
      recordId,
      "--format",
      "json",
    ],
    cwd
  );
  const records = extractBaseRecords(payload);
  return records.length === 1 ? records[0] : null;
}

async function readBackRecord(
  config: FeishuProductFeedbackConfig,
  recordId: string,
  expected: JsonObject,
  collaborationKey: string,
  runner: LarkCliRunner,
  cwd: string,
  waitForRetry: (delay: number) => Promise<void>
) {
  let checks = 0;
  for (let attempt = 0; attempt <= READ_BACK_DELAYS_MS.length; attempt += 1) {
    checks += 1;
    try {
      const record = await readRecord(config, recordId, runner, cwd);
      if (!record) fail("readback_failed");
      verifySourceReadBack(record, expected, collaborationKey);
      return { record, checks };
    } catch (error) {
      if (
        error instanceof FeishuFeedbackAdapterError &&
        !["readback_failed", "remote_read_failed"].includes(error.code)
      )
        throw error;
      if (attempt < READ_BACK_DELAYS_MS.length)
        await waitForRetry(READ_BACK_DELAYS_MS[attempt]);
    }
  }
  fail("readback_failed");
}

export async function syncProductFeedbackRecord(
  config: FeishuProductFeedbackConfig,
  input: ProductFeedbackHandoffPayload,
  options: {
    runner?: LarkCliRunner;
    cwd?: string;
    preflight?: boolean;
    waitForRetry?: (delay: number) => Promise<void>;
  } = {}
): Promise<FeishuProductFeedbackSyncReceipt> {
  validateConfig(config);
  const frozen = frozenPayload(input);
  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  if (options.preflight !== false)
    await preflightFeishuProductFeedback(config, { runner, cwd });
  const fields = sourceFields(
    frozen.payload,
    frozen.serialized,
    frozen.fingerprint
  );
  return withFeishuFeedbackCollaborationLock(
    config.baseToken,
    frozen.payload.originKey,
    async () => {
      const existing = await findByCollaborationKey(
        config,
        frozen.payload.originKey,
        runner,
        cwd
      );
      if (existing) {
        const stored = verifyExistingFrozenPayload(existing, frozen);
        if (stored.payload.outboxId === frozen.payload.outboxId) {
          if (stored.fingerprint !== frozen.fingerprint)
            fail("payload_conflict");
          verifySourceReadBack(existing, fields, frozen.payload.originKey);
          return {
            collaborationKey: frozen.payload.originKey,
            feedbackId: frozen.payload.feedbackId,
            action: "skipped_existing",
            recordId: existing.id,
            readBackVerified: true,
            readBackChecks: 1,
          };
        }
        if (
          frozen.payload.sequence !== stored.payload.sequence + 1 ||
          frozen.payload.round < stored.payload.round ||
          !["diagnosis_update", "maintenance_update"].includes(
            frozen.payload.kind
          )
        )
          fail("payload_conflict");
      } else if (
        frozen.payload.kind !== "initial_submission" ||
        frozen.payload.sequence !== 1
      ) {
        fail("payload_conflict");
      }

      const args = [
        "base",
        "+record-upsert",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        config.tableId,
        ...(existing ? ["--record-id", existing.id] : []),
        "--json",
        JSON.stringify(
          existing ? fields : { ...fields, [FIELDS.processingStatus]: "new" }
        ),
        "--format",
        "json",
      ];
      const writePayload = await checkedWrite(runner, args, cwd);
      const recordId = existing?.id ?? extractRecordId(writePayload);
      if (!recordId) fail("remote_write_failed");
      const readBack = await readBackRecord(
        config,
        recordId,
        fields,
        frozen.payload.originKey,
        runner,
        cwd,
        options.waitForRetry ??
          (async delay =>
            new Promise(resolve => {
              setTimeout(resolve, delay);
            }))
      );
      return {
        collaborationKey: frozen.payload.originKey,
        feedbackId: frozen.payload.feedbackId,
        action: existing ? "updated" : "created",
        recordId,
        readBackVerified: true,
        readBackChecks: readBack.checks,
      };
    }
  );
}

function parseMaintenanceRecord(record: BaseRecord) {
  const serialized = fieldText(record, FIELDS.frozenPayload);
  const fingerprint = fieldText(record, FIELDS.handoffFingerprint);
  if (!serialized || !fingerprint) fail("payload_conflict");
  let frozen: ReturnType<typeof frozenPayload>;
  try {
    frozen = frozenPayload(JSON.parse(serialized) as unknown);
  } catch {
    fail("payload_conflict");
  }
  if (frozen.fingerprint !== fingerprint) fail("payload_conflict");
  if (
    fieldText(record, FIELDS.collaborationKey) !== frozen.payload.originKey ||
    fieldText(record, FIELDS.feedbackId) !== frozen.payload.feedbackId ||
    fieldText(record, FIELDS.latestOutboxId) !== frozen.payload.outboxId
  )
    fail("payload_conflict");
  return {
    recordId: record.id,
    collaborationKey: frozen.payload.originKey,
    feedbackId: frozen.payload.feedbackId,
    payload: frozen.payload,
    processingStatus: fieldText(record, FIELDS.processingStatus),
    maintainerReply: fieldText(record, FIELDS.maintainerReply),
    maintainerName: fieldText(record, FIELDS.maintainerName),
    maintenanceTaskId: fieldText(record, FIELDS.maintenanceTaskId),
    maintenanceUpdatedAt: fieldText(record, FIELDS.maintenanceUpdatedAt),
  };
}

export async function pullFeishuMaintenanceInbox(
  config: FeishuProductFeedbackConfig,
  options: { runner?: LarkCliRunner; cwd?: string; now?: Date } = {}
): Promise<FeishuMaintenanceInboxSnapshot> {
  validateConfig(config);
  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  await preflightFeishuProductFeedback(config, { runner, cwd });
  const records: BaseRecord[] = [];
  let pageCount = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await checkedRead(
      runner,
      [
        "base",
        "+record-list",
        "--as",
        "user",
        "--base-token",
        config.baseToken,
        "--table-id",
        config.tableId,
        ...projectedFieldArgs,
        "--offset",
        String(page * PAGE_SIZE),
        "--limit",
        String(PAGE_SIZE),
        "--format",
        "json",
      ],
      cwd
    );
    const pageRecords = extractBaseRecords(payload);
    records.push(...pageRecords);
    pageCount += 1;
    if (pageRecords.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) fail("remote_read_failed");
  }
  const items = records.map(parseMaintenanceRecord);
  const keys = new Set<string>();
  for (const item of items) {
    if (keys.has(item.collaborationKey)) fail("duplicate_collaboration_key");
    keys.add(item.collaborationKey);
  }
  return {
    items,
    pageCount,
    readAt: (options.now ?? new Date()).toISOString(),
  };
}

function validateOriginKeys(originKeys: readonly string[]) {
  if (originKeys.length > 1_000) fail("invalid_payload");
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const key of originKeys) {
    if (
      typeof key !== "string" ||
      key.length < 8 ||
      key.length > 160 ||
      key.trim() !== key ||
      /[\u0000-\u001f\u007f]/u.test(key)
    )
      fail("invalid_payload");
    if (!seen.has(key)) {
      unique.push(key);
      seen.add(key);
    }
  }
  return unique;
}

/**
 * Reporter-side pull. Every remote read is scoped to one locally owned origin
 * key; unlike the maintainer inbox, this path never enumerates the Base.
 */
export async function pullFeishuMaintenanceUpdatesForOriginKeys(
  config: FeishuProductFeedbackConfig,
  originKeys: readonly string[],
  options: { runner?: LarkCliRunner; cwd?: string; now?: Date } = {}
): Promise<FeishuReporterMaintenanceSnapshot> {
  validateConfig(config);
  const keys = validateOriginKeys(originKeys);
  if (keys.length === 0)
    return {
      items: [],
      queryCount: 0,
      readAt: (options.now ?? new Date()).toISOString(),
    };

  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  await preflightFeishuProductFeedback(config, { runner, cwd });
  const items = [];
  for (const originKey of keys) {
    const record = await findByCollaborationKey(config, originKey, runner, cwd);
    if (!record) continue;
    const item = parseMaintenanceRecord(record);
    if (item.collaborationKey !== originKey) fail("payload_conflict");
    if (item.payload.kind === "maintenance_update") items.push(item);
  }
  return {
    items,
    queryCount: keys.length,
    readAt: (options.now ?? new Date()).toISOString(),
  };
}
