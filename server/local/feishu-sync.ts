import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  FEISHU_INDEX_FIELD_NAMES,
  FEISHU_INDEX_REQUIRED_FIELDS,
  type FeishuInternalStorageConfig,
  type FeishuProjectSyncInput,
  type FeishuProjectSyncPlan,
  type FeishuProjectSyncPreflight,
  type FeishuProjectSyncReceipt,
  type FeishuSyncItemReceipt,
  type FeishuSyncPlanItem,
} from "../../shared/feishu-sync";

export type LarkCliRunOptions = {
  cwd: string;
};

export type LarkCliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export interface LarkCliRunner {
  run(args: string[], options: LarkCliRunOptions): Promise<LarkCliRunResult>;
}

type JsonObject = Record<string, unknown>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_OUTPUT_CHARACTERS = 2_000_000;

function appendOutput(current: string, chunk: Buffer) {
  return (current + chunk.toString("utf8")).slice(-MAX_OUTPUT_CHARACTERS);
}

export class SpawnLarkCliRunner implements LarkCliRunner {
  private readonly executable: string;
  private readonly prefixArgs: string[];

  constructor(executable?: string) {
    if (executable) {
      this.executable = executable;
      this.prefixArgs = [];
      return;
    }
    const bundledScript = path.join(
      path.dirname(process.execPath),
      "node_modules",
      "@larksuite",
      "cli",
      "scripts",
      "run.js"
    );
    if (process.platform === "win32" && fs.existsSync(bundledScript)) {
      this.executable = process.execPath;
      this.prefixArgs = [bundledScript];
      return;
    }
    this.executable = "lark-cli";
    this.prefixArgs = [];
  }

  run(args: string[], options: LarkCliRunOptions) {
    return new Promise<LarkCliRunResult>((resolve, reject) => {
      const child = spawn(this.executable, [...this.prefixArgs, ...args], {
        cwd: options.cwd,
        env: {
          ...process.env,
          LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
          LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
        },
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => {
        stdout = appendOutput(stdout, chunk as Buffer);
      });
      child.stderr.on("data", chunk => {
        stderr = appendOutput(stderr, chunk as Buffer);
      });
      child.once("error", reject);
      child.once("close", code =>
        resolve({ exitCode: code ?? -1, stdout, stderr })
      );
    });
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function sanitizeLarkCliError(value: string) {
  return value
    .replace(/\bBearer\s+[^\s"']+/giu, "Bearer [redacted]")
    .replace(
      /\b(?:access|refresh|tenant|app)[_-]?(?:token|secret)\s*[:=]\s*[^\s,"'}]+/giu,
      "credential=[redacted]"
    )
    .replace(
      /\b(?:fld|bas|tbl|box|docx|doxcn|shtcn|wikcn|fil)[A-Za-z0-9_-]{8,}\b/gu,
      "[feishu-resource]"
    )
    .replace(/[A-Za-z]:\\[^\r\n"']+/gu, "[local-path]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1_000);
}

async function runChecked(runner: LarkCliRunner, args: string[], cwd: string) {
  const result = await runner.run(args, { cwd });
  const payload = parseJson(result.stdout);
  if (result.exitCode !== 0 || !isObject(payload) || payload.ok !== true) {
    const errorPayload = parseJson(result.stderr);
    const error = isObject(errorPayload) ? errorPayload.error : null;
    const message =
      isObject(error) && typeof error.message === "string"
        ? error.message
        : sanitizeLarkCliError(result.stderr || result.stdout) ||
          `lark-cli exited with code ${result.exitCode}`;
    throw new Error(message);
  }
  if (typeof payload.identity === "string" && payload.identity !== "user")
    throw new Error(
      `飞书操作身份错误：expected user, received ${payload.identity}`
    );
  return payload;
}

async function verifyUserAuthentication(runner: LarkCliRunner, cwd: string) {
  const result = await runner.run(["auth", "status", "--json", "--verify"], {
    cwd,
  });
  const payload = parseJson(result.stdout);
  if (result.exitCode !== 0 || !isObject(payload))
    throw new Error(
      sanitizeLarkCliError(result.stderr || result.stdout) ||
        "无法读取飞书用户登录态"
    );
  // `auth status` is a CLI-local command and currently returns its status
  // object directly, while OpenAPI commands return the `{ok,data}` envelope.
  const status = payload.ok === true ? dataOf(payload) : payload;
  if (status.identity !== "user")
    throw new Error(
      `飞书当前身份不是 user：${String(status.identity ?? "unknown")}`
    );
  if (status.verified !== true) throw new Error("飞书用户登录态未通过在线校验");
  const identities = isObject(status.identities) ? status.identities : {};
  const user = isObject(identities.user) ? identities.user : {};
  if (
    typeof user.status === "string" &&
    !["ready", "logged_in"].includes(user.status)
  )
    throw new Error(`飞书用户登录态不可用：${user.status}`);
  if (typeof user.tokenStatus === "string" && user.tokenStatus !== "valid")
    throw new Error(`飞书用户令牌状态不可用：${user.tokenStatus}`);
}

/** Shared user-scoped authentication gate for other local Feishu adapters. */
export async function verifyLarkUserAuthentication(
  runner: LarkCliRunner,
  cwd: string
) {
  return verifyUserAuthentication(runner, cwd);
}

/** Shared checked CLI execution. Callers must map thrown details to safe errors. */
export async function runCheckedLarkCli(
  runner: LarkCliRunner,
  args: string[],
  cwd: string
) {
  return runChecked(runner, args, cwd);
}

function dataOf(payload: JsonObject) {
  return isObject(payload.data) ? payload.data : {};
}

function sanitizeSegment(value: string, fallback: string) {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, " ")
    .trim();
  return (cleaned || fallback).slice(0, 120);
}

function validateLocator(name: string, value: string) {
  if (!value.trim()) throw new Error(`${name} 未配置`);
  if (/\s/u.test(value)) throw new Error(`${name} 不能包含空白字符`);
  if (/^https?:\/\//iu.test(value))
    throw new Error(`${name} 必须是已解析的定位符，不能是完整 URL`);
}

function validateConfig(config: FeishuInternalStorageConfig) {
  validateLocator("driveRootFolderToken", config.driveRootFolderToken);
  validateLocator("baseToken", config.baseToken);
  if (!config.baseTableId.trim()) throw new Error("baseTableId 未配置");
}

function validatePlanForExecution(plan: FeishuProjectSyncPlan) {
  validateConfig(plan.config);
  if (
    plan.invariants.identity !== "user" ||
    plan.invariants.retainEveryVersion !== true ||
    plan.invariants.overwriteAllowed !== false ||
    plan.invariants.deleteAllowed !== false ||
    plan.invariants.dedupeKey !== "sha256" ||
    plan.invariants.baseRole !== "thin_index" ||
    plan.invariants.credentialsPersisted !== false
  )
    throw new Error("飞书同步计划违反只追加、安全或用户身份边界");
  const hashes = new Set<string>();
  for (const item of plan.items) {
    if (hashes.has(item.sha256))
      throw new Error(`执行计划包含重复 SHA-256：${item.sha256}`);
    hashes.add(item.sha256);
    if (
      !fs.existsSync(item.absolutePath) ||
      !fs.statSync(item.absolutePath).isFile()
    )
      throw new Error(`本地同步源不存在：${item.originalName}`);
    if (
      fs.statSync(item.absolutePath).size !== item.sizeBytes ||
      hashFile(item.absolutePath) !== item.sha256
    )
      throw new Error(`执行前文件内容校验失败：${item.originalName}`);
    if (!item.remoteFilename.includes(item.sha256.slice(0, 12)))
      throw new Error(`远端文件名缺少内容哈希：${item.originalName}`);
  }
}

function hashFile(absolutePath: string) {
  return createHash("sha256")
    .update(fs.readFileSync(absolutePath))
    .digest("hex");
}

function stablePlanId(input: {
  schemaVersion: "1.0";
  project: FeishuProjectSyncInput["project"];
  requestedBy: string;
  config: FeishuInternalStorageConfig;
  folderLayout: FeishuProjectSyncPlan["folderLayout"];
  items: Array<{
    fileId: string;
    kind: FeishuSyncPlanItem["kind"];
    category: string;
    versionNumber: number | null;
    originalName: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    createdAt: string;
    folderKind: FeishuSyncPlanItem["folderKind"];
    remoteFilename: string;
  }>;
}) {
  return `fsp_${createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 24)}`;
}

function remoteFilename(file: FeishuProjectSyncInput["files"][number]) {
  const original = sanitizeSegment(file.originalName, "project-file");
  const hash = file.sha256.slice(0, 12);
  if (file.kind === "bp") {
    const version = String(file.versionNumber ?? 0).padStart(3, "0");
    return `BP-v${version}-${hash}-${original}`;
  }
  return `${sanitizeSegment(file.category, "other")}-${hash}-${original}`;
}

export function planFeishuProjectSync(
  config: FeishuInternalStorageConfig,
  input: FeishuProjectSyncInput,
  now = new Date()
): FeishuProjectSyncPlan {
  validateConfig(config);
  const normalizedConfig: FeishuInternalStorageConfig = {
    driveRootFolderToken: config.driveRootFolderToken,
    baseToken: config.baseToken,
    baseTableId: config.baseTableId,
  };
  if (!input.project.id.trim()) throw new Error("project.id 不能为空");
  if (!input.project.name.trim()) throw new Error("project.name 不能为空");
  if (!input.requestedBy.trim()) throw new Error("requestedBy 不能为空");

  const seenHashes = new Set<string>();
  const items: FeishuSyncPlanItem[] = input.files.map(file => {
    const absolute = path.resolve(file.absolutePath);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile())
      throw new Error(`本地同步源不存在：${file.originalName}`);
    if (!SHA256_PATTERN.test(file.sha256))
      throw new Error(`SHA-256 格式错误：${file.originalName}`);
    if (seenHashes.has(file.sha256))
      throw new Error(`同步计划包含重复 SHA-256：${file.sha256}`);
    seenHashes.add(file.sha256);
    const actualHash = hashFile(absolute);
    if (actualHash !== file.sha256)
      throw new Error(`文件内容与 SHA-256 不一致：${file.originalName}`);
    const actualSize = fs.statSync(absolute).size;
    if (actualSize !== file.sizeBytes)
      throw new Error(`文件大小与元数据不一致：${file.originalName}`);
    if (file.kind === "bp" && (!file.versionNumber || file.versionNumber < 1))
      throw new Error(`BP 必须提供正整数版本号：${file.originalName}`);
    return {
      ...file,
      absolutePath: absolute,
      syncKey: file.sha256,
      folderKind: file.kind,
      remoteFilename: remoteFilename(file),
    };
  });
  items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "bp" ? -1 : 1;
    if (left.kind === "bp")
      return (left.versionNumber ?? 0) - (right.versionNumber ?? 0);
    return left.createdAt.localeCompare(right.createdAt);
  });

  const folderLayout: FeishuProjectSyncPlan["folderLayout"] = {
    projectFolderName: `${sanitizeSegment(input.project.name, "Project")} [${sanitizeSegment(input.project.id, "project")}]`,
    bpFolderName: "01_BP 原件",
    materialFolderName: "02_补充材料",
  };
  const planId = stablePlanId({
    schemaVersion: "1.0",
    project: { ...input.project },
    requestedBy: input.requestedBy,
    config: normalizedConfig,
    folderLayout,
    items: items.map(item => ({
      fileId: item.fileId,
      kind: item.kind,
      category: item.category,
      versionNumber: item.versionNumber,
      originalName: item.originalName,
      sha256: item.sha256,
      sizeBytes: item.sizeBytes,
      mimeType: item.mimeType,
      createdAt: item.createdAt,
      folderKind: item.folderKind,
      remoteFilename: item.remoteFilename,
    })),
  });
  return {
    schemaVersion: "1.0",
    planId,
    generatedAt: now.toISOString(),
    project: input.project,
    requestedBy: input.requestedBy,
    config: normalizedConfig,
    folderLayout,
    items,
    invariants: {
      identity: "user",
      retainEveryVersion: true,
      overwriteAllowed: false,
      deleteAllowed: false,
      dedupeKey: "sha256",
      baseRole: "thin_index",
      credentialsPersisted: false,
    },
  };
}

type DriveEntry = {
  name: string;
  type: string;
  token: string;
  url: string | null;
};

function extractDriveEntries(payload: JsonObject): DriveEntry[] {
  const data = dataOf(payload);
  const files = Array.isArray(data.files) ? data.files : [];
  return files.flatMap(value => {
    if (!isObject(value)) return [];
    const name = typeof value.name === "string" ? value.name : null;
    const token =
      typeof value.token === "string"
        ? value.token
        : typeof value.file_token === "string"
          ? value.file_token
          : null;
    if (!name || !token) return [];
    return [
      {
        name,
        token,
        type: typeof value.type === "string" ? value.type : "file",
        url: typeof value.url === "string" ? value.url : null,
      },
    ];
  });
}

async function listDriveChildren(
  runner: LarkCliRunner,
  cwd: string,
  folderToken: string
) {
  const entries: DriveEntry[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 100; page += 1) {
    const params: Record<string, unknown> = {
      folder_token: folderToken,
      page_size: 200,
    };
    if (pageToken) params.page_token = pageToken;
    const payload = await runChecked(
      runner,
      [
        "drive",
        "files",
        "list",
        "--as",
        "user",
        "--params",
        JSON.stringify(params),
        "--format",
        "json",
      ],
      cwd
    );
    entries.push(...extractDriveEntries(payload));
    const data = dataOf(payload);
    if (data.has_more !== true) return entries;
    const next =
      typeof data.next_page_token === "string" ? data.next_page_token : "";
    if (!next || next === pageToken)
      throw new Error("飞书云盘分页返回缺少有效 next_page_token");
    pageToken = next;
  }
  throw new Error("飞书云盘目录分页超过安全上限");
}

async function exactDriveEntry(
  runner: LarkCliRunner,
  cwd: string,
  folderToken: string,
  name: string,
  type?: "folder" | "file"
) {
  const matches = (await listDriveChildren(runner, cwd, folderToken)).filter(
    entry => entry.name === name && (!type || entry.type === type)
  );
  if (matches.length > 1) throw new Error(`飞书目录存在重名对象：${name}`);
  return matches[0] ?? null;
}

async function readBack<T>(reader: () => Promise<T | null>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const value = await reader();
    if (value) return value;
    if (attempt < 2)
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
  }
  return null;
}

const INDEX_READ_BACK_RETRY_DELAYS_MS = [200, 600, 1_200, 2_400] as const;

async function waitForIndexReadBackRetry(attempt: number) {
  const delay = INDEX_READ_BACK_RETRY_DELAYS_MS[attempt];
  if (delay === undefined) return;
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function ensureFolder(
  runner: LarkCliRunner,
  cwd: string,
  parentToken: string,
  name: string
) {
  const existing = await exactDriveEntry(
    runner,
    cwd,
    parentToken,
    name,
    "folder"
  );
  if (existing) return { entry: existing, created: false, checks: 1 };
  await runChecked(
    runner,
    [
      "drive",
      "+create-folder",
      "--as",
      "user",
      "--folder-token",
      parentToken,
      "--name",
      name,
      "--format",
      "json",
    ],
    cwd
  );
  const created = await readBack(() =>
    exactDriveEntry(runner, cwd, parentToken, name, "folder")
  );
  if (!created) throw new Error(`飞书文件夹写后回读失败：${name}`);
  return { entry: created, created: true, checks: 2 };
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
      return name
        ? [[name, typeof value.type === "string" ? value.type : null] as const]
        : [];
    })
  );
}

async function validateIndexSchema(
  runner: LarkCliRunner,
  cwd: string,
  config: FeishuInternalStorageConfig
) {
  const payload = await runChecked(
    runner,
    [
      "base",
      "+field-list",
      "--as",
      "user",
      "--base-token",
      config.baseToken,
      "--table-id",
      config.baseTableId,
      "--limit",
      "200",
      "--format",
      "json",
    ],
    cwd
  );
  const fields = extractFieldSchema(payload);
  const missing = FEISHU_INDEX_REQUIRED_FIELDS.filter(
    name => !fields.has(name)
  );
  if (missing.length > 0)
    throw new Error(`飞书薄索引缺少字段：${missing.join("、")}`);
  const expectedTypes = new Map<string, string>([
    [FEISHU_INDEX_FIELD_NAMES.bpVersion, "number"],
    [FEISHU_INDEX_FIELD_NAMES.sizeBytes, "number"],
    [FEISHU_INDEX_FIELD_NAMES.syncedAt, "datetime"],
  ]);
  const incompatible = [...expectedTypes].flatMap(([name, expected]) => {
    const actual = fields.get(name);
    return actual && actual !== expected
      ? [`${name}=${actual}（应为 ${expected}）`]
      : [];
  });
  if (incompatible.length > 0)
    throw new Error(`飞书薄索引字段类型不兼容：${incompatible.join("、")}`);
}

type BaseRecord = {
  id: string;
  fields: JsonObject;
};

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

async function findIndexByHash(
  runner: LarkCliRunner,
  cwd: string,
  config: FeishuInternalStorageConfig,
  sha256: string
) {
  const payload = await runChecked(
    runner,
    [
      "base",
      "+record-list",
      "--as",
      "user",
      "--base-token",
      config.baseToken,
      "--table-id",
      config.baseTableId,
      "--field-id",
      FEISHU_INDEX_FIELD_NAMES.syncKey,
      "--field-id",
      FEISHU_INDEX_FIELD_NAMES.sha256,
      "--field-id",
      FEISHU_INDEX_FIELD_NAMES.projectId,
      "--field-id",
      FEISHU_INDEX_FIELD_NAMES.driveUrl,
      "--field-id",
      FEISHU_INDEX_FIELD_NAMES.driveFileToken,
      "--filter-json",
      JSON.stringify({
        logic: "and",
        conditions: [[FEISHU_INDEX_FIELD_NAMES.sha256, "==", sha256]],
      }),
      "--limit",
      "2",
      "--format",
      "json",
    ],
    cwd
  );
  const records = extractBaseRecords(payload);
  if (records.length > 1)
    throw new Error(`飞书薄索引存在重复 SHA-256：${sha256}`);
  return records[0] ?? null;
}

function fieldString(record: BaseRecord, field: string) {
  const value = record.fields[field];
  if (typeof value === "string") return value;
  if (isObject(value) && typeof value.text === "string") return value.text;
  return null;
}

function verifyExistingIndex(
  record: BaseRecord,
  item: FeishuSyncPlanItem,
  projectId: string
) {
  if (fieldString(record, FEISHU_INDEX_FIELD_NAMES.sha256) !== item.sha256)
    throw new Error(`飞书薄索引 SHA-256 回读不一致：${item.originalName}`);
  const indexedProject = fieldString(
    record,
    FEISHU_INDEX_FIELD_NAMES.projectId
  );
  if (indexedProject && indexedProject !== projectId)
    throw new Error(`相同 SHA-256 已归属于其他项目：${indexedProject}`);
  if (!fieldString(record, FEISHU_INDEX_FIELD_NAMES.driveFileToken))
    throw new Error(`飞书薄索引缺少文件 Token：${item.originalName}`);
  if (!fieldString(record, FEISHU_INDEX_FIELD_NAMES.driveUrl))
    throw new Error(`飞书薄索引缺少文件链接：${item.originalName}`);
}

/**
 * Compare a frozen local plan with the authoritative thin index without
 * creating folders, uploading files or writing Base records. The caller may
 * use this to present a plain-language add/skip summary before confirmation.
 */
export async function preflightFeishuProjectSync(
  plan: FeishuProjectSyncPlan,
  options: {
    runner?: LarkCliRunner;
    cwd?: string;
  } = {}
): Promise<FeishuProjectSyncPreflight> {
  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  validatePlanForExecution(plan);
  await verifyUserAuthentication(runner, cwd);
  await validateIndexSchema(runner, cwd, plan.config);

  const items: FeishuProjectSyncPreflight["items"] = [];
  for (const item of plan.items) {
    const existingIndex = await findIndexByHash(
      runner,
      cwd,
      plan.config,
      item.sha256
    );
    if (existingIndex)
      verifyExistingIndex(existingIndex, item, plan.project.id);
    items.push({
      fileId: item.fileId,
      action: existingIndex ? "skip_duplicate" : "add_new",
    });
  }
  return { items };
}

function formatBaseDatetime(date: Date) {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/u, "");
}

function makeIndexFields(
  plan: FeishuProjectSyncPlan,
  item: FeishuSyncPlanItem,
  driveEntry: DriveEntry,
  now: Date
) {
  if (!driveEntry.url)
    throw new Error(`飞书文件回读缺少浏览链接：${item.originalName}`);
  return {
    [FEISHU_INDEX_FIELD_NAMES.syncKey]: item.syncKey,
    [FEISHU_INDEX_FIELD_NAMES.projectId]: plan.project.id,
    [FEISHU_INDEX_FIELD_NAMES.projectName]: plan.project.name,
    [FEISHU_INDEX_FIELD_NAMES.localFileId]: item.fileId,
    [FEISHU_INDEX_FIELD_NAMES.materialType]:
      item.kind === "bp" ? "BP" : item.category,
    [FEISHU_INDEX_FIELD_NAMES.bpVersion]: item.versionNumber,
    [FEISHU_INDEX_FIELD_NAMES.originalFilename]: item.originalName,
    [FEISHU_INDEX_FIELD_NAMES.driveFilename]: item.remoteFilename,
    [FEISHU_INDEX_FIELD_NAMES.sha256]: item.sha256,
    [FEISHU_INDEX_FIELD_NAMES.sizeBytes]: item.sizeBytes,
    [FEISHU_INDEX_FIELD_NAMES.mimeType]: item.mimeType,
    [FEISHU_INDEX_FIELD_NAMES.driveUrl]: driveEntry.url,
    [FEISHU_INDEX_FIELD_NAMES.driveFileToken]: driveEntry.token,
    [FEISHU_INDEX_FIELD_NAMES.syncStatus]: "已同步",
    [FEISHU_INDEX_FIELD_NAMES.syncedAt]: formatBaseDatetime(now),
    [FEISHU_INDEX_FIELD_NAMES.syncedBy]: plan.requestedBy,
  };
}

function extractCreatedRecordId(payload: JsonObject) {
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

async function createAndVerifyIndex(
  runner: LarkCliRunner,
  cwd: string,
  plan: FeishuProjectSyncPlan,
  item: FeishuSyncPlanItem,
  driveEntry: DriveEntry,
  now: Date,
  waitForRetry: (attempt: number) => Promise<void>,
  onReadBackAttempt: () => void
) {
  const fields = makeIndexFields(plan, item, driveEntry, now);
  const payload = await runChecked(
    runner,
    [
      "base",
      "+record-upsert",
      "--as",
      "user",
      "--base-token",
      plan.config.baseToken,
      "--table-id",
      plan.config.baseTableId,
      "--json",
      JSON.stringify(fields),
      "--format",
      "json",
    ],
    cwd
  );
  const recordId = extractCreatedRecordId(payload);
  if (!recordId) throw new Error("飞书薄索引写入未返回 record_id");
  let lastError: unknown = new Error("飞书薄索引写后回读失败");
  for (
    let attempt = 0;
    attempt <= INDEX_READ_BACK_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    onReadBackAttempt();
    try {
      const readPayload = await runChecked(
        runner,
        [
          "base",
          "+record-get",
          "--as",
          "user",
          "--base-token",
          plan.config.baseToken,
          "--table-id",
          plan.config.baseTableId,
          "--record-id",
          recordId,
          "--format",
          "json",
        ],
        cwd
      );
      const records = extractBaseRecords(readPayload);
      if (records.length !== 1) throw new Error("飞书薄索引写后回读失败");
      verifyExistingIndex(records[0], item, plan.project.id);
      if (
        fieldString(records[0], FEISHU_INDEX_FIELD_NAMES.driveFileToken) !==
        driveEntry.token
      )
        throw new Error(`飞书文件 Token 回读不一致：${item.originalName}`);
      return recordId;
    } catch (error) {
      lastError = error;
      if (attempt < INDEX_READ_BACK_RETRY_DELAYS_MS.length)
        await waitForRetry(attempt);
    }
  }
  throw lastError;
}

function newItemReceipt(item: FeishuSyncPlanItem): FeishuSyncItemReceipt {
  return {
    fileId: item.fileId,
    sha256: item.sha256,
    remoteFilename: item.remoteFilename,
    status: "failed",
    recoveryMode: "none",
    driveFileToken: null,
    driveUrl: null,
    baseRecordId: null,
    readBackVerified: false,
    error: null,
  };
}

function makeReceipt(
  plan: FeishuProjectSyncPlan,
  mode: "dry_run" | "execute",
  startedAt: string
): FeishuProjectSyncReceipt {
  return {
    schemaVersion: "1.0",
    receiptId: `fsr_${randomUUID()}`,
    planId: plan.planId,
    projectId: plan.project.id,
    requestedBy: plan.requestedBy,
    mode,
    status: mode === "dry_run" ? "planned" : "failed",
    startedAt,
    finishedAt: startedAt,
    writes: {
      foldersCreated: 0,
      filesUploaded: 0,
      indexRecordsCreated: 0,
      overwrites: 0,
      deletes: 0,
    },
    verification: {
      schemaChecked: false,
      readBackChecks: 0,
      allPassed: mode === "dry_run",
    },
    items: plan.items.map(newItemReceipt),
    error: null,
    boundaries: plan.invariants,
  };
}

export async function syncProjectToFeishu(
  plan: FeishuProjectSyncPlan,
  options: {
    dryRun?: boolean;
    runner?: LarkCliRunner;
    cwd?: string;
    now?: Date;
    readBackRetryDelay?: (attempt: number) => Promise<void>;
  } = {}
) {
  const started = options.now ?? new Date();
  const receipt = makeReceipt(
    plan,
    options.dryRun === true ? "dry_run" : "execute",
    started.toISOString()
  );
  if (options.dryRun === true) {
    receipt.finishedAt = started.toISOString();
    return receipt;
  }

  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  try {
    validatePlanForExecution(plan);
    await verifyUserAuthentication(runner, cwd);
    await validateIndexSchema(runner, cwd, plan.config);
    receipt.verification.schemaChecked = true;
    receipt.verification.readBackChecks += 1;

    let projectFolder: DriveEntry | null = null;
    const materialFolders = new Map<"bp" | "material", DriveEntry>();
    for (let index = 0; index < plan.items.length; index += 1) {
      const item = plan.items[index];
      const itemReceipt = receipt.items[index];
      try {
        const existingIndex = await findIndexByHash(
          runner,
          cwd,
          plan.config,
          item.sha256
        );
        receipt.verification.readBackChecks += 1;
        if (existingIndex) {
          verifyExistingIndex(existingIndex, item, plan.project.id);
          itemReceipt.status = "skipped_existing";
          itemReceipt.baseRecordId = existingIndex.id;
          itemReceipt.driveFileToken = fieldString(
            existingIndex,
            FEISHU_INDEX_FIELD_NAMES.driveFileToken
          );
          itemReceipt.driveUrl = fieldString(
            existingIndex,
            FEISHU_INDEX_FIELD_NAMES.driveUrl
          );
          itemReceipt.readBackVerified = true;
          continue;
        }

        if (!projectFolder) {
          const ensured = await ensureFolder(
            runner,
            cwd,
            plan.config.driveRootFolderToken,
            plan.folderLayout.projectFolderName
          );
          projectFolder = ensured.entry;
          if (ensured.created) receipt.writes.foldersCreated += 1;
          receipt.verification.readBackChecks += ensured.checks;
        }
        let targetFolder = materialFolders.get(item.folderKind);
        if (!targetFolder) {
          const name =
            item.folderKind === "bp"
              ? plan.folderLayout.bpFolderName
              : plan.folderLayout.materialFolderName;
          const ensured = await ensureFolder(
            runner,
            cwd,
            projectFolder.token,
            name
          );
          targetFolder = ensured.entry;
          materialFolders.set(item.folderKind, targetFolder);
          if (ensured.created) receipt.writes.foldersCreated += 1;
          receipt.verification.readBackChecks += ensured.checks;
        }

        let driveEntry = await exactDriveEntry(
          runner,
          cwd,
          targetFolder.token,
          item.remoteFilename,
          "file"
        );
        receipt.verification.readBackChecks += 1;
        if (driveEntry)
          itemReceipt.recoveryMode = "indexed_existing_drive_file";
        else {
          const sourceDirectory = path.dirname(item.absolutePath);
          const relativeFile = path.basename(item.absolutePath);
          await runChecked(
            runner,
            [
              "drive",
              "+upload",
              "--as",
              "user",
              "--file",
              relativeFile,
              "--folder-token",
              targetFolder.token,
              "--name",
              item.remoteFilename,
              "--format",
              "json",
            ],
            sourceDirectory
          );
          receipt.writes.filesUploaded += 1;
          const uploadedEntry = await readBack(() =>
            exactDriveEntry(
              runner,
              cwd,
              targetFolder.token,
              item.remoteFilename,
              "file"
            )
          );
          receipt.verification.readBackChecks += 1;
          if (!uploadedEntry)
            throw new Error(`飞书文件上传后回读失败：${item.originalName}`);
          driveEntry = uploadedEntry;
        }

        const recordId = await createAndVerifyIndex(
          runner,
          cwd,
          plan,
          item,
          driveEntry,
          started,
          options.readBackRetryDelay ?? waitForIndexReadBackRetry,
          () => {
            receipt.verification.readBackChecks += 1;
          }
        );
        receipt.writes.indexRecordsCreated += 1;
        itemReceipt.status = "succeeded";
        itemReceipt.driveFileToken = driveEntry.token;
        itemReceipt.driveUrl = driveEntry.url;
        itemReceipt.baseRecordId = recordId;
        itemReceipt.readBackVerified = true;
      } catch (error) {
        itemReceipt.status = "failed";
        itemReceipt.error =
          error instanceof Error ? error.message : String(error);
        throw error;
      }
    }
    receipt.status = "succeeded";
    receipt.verification.allPassed = receipt.items.every(
      item => item.readBackVerified
    );
  } catch (error) {
    receipt.status = "failed";
    receipt.error = error instanceof Error ? error.message : String(error);
    receipt.verification.allPassed = false;
  }
  receipt.finishedAt = new Date().toISOString();
  return receipt;
}
