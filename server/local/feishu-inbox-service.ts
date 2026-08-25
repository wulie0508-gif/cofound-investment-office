import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  FeishuInboxPlan,
  FeishuInboxPullItem,
  FeishuInboxPullReceipt,
} from "../../shared/feishu-sync";
import { FEISHU_TEAM_INBOX_NAME } from "../../shared/feishu-sync";
import { getDatabase, type LocalDatabase } from "./database";
import { SUPPORTED_EXTENSIONS } from "./extractor";
import {
  runCheckedLarkCli,
  sanitizeLarkCliError,
  SpawnLarkCliRunner,
  verifyLarkUserAuthentication,
  type LarkCliRunner,
} from "./feishu-sync";
import {
  assertEnterpriseSharedStorageScope,
  readInternalStorageConfig,
} from "./feishu-sync-service";
import { importDocument } from "./importer";
import { OperationLedger } from "./operation-ledger";
import { restoreLocalProject } from "./project-lifecycle-service";

type JsonObject = Record<string, unknown>;

type RemoteEntry = {
  name: string;
  type: string;
  token: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
};

const MAX_BP_BYTES = 50 * 1024 * 1024;
let inboxPullQueue: Promise<void> = Promise.resolve();

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dataOf(payload: JsonObject) {
  return isObject(payload.data) ? payload.data : {};
}

function scalarString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function scalarNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function entriesOf(payload: JsonObject): RemoteEntry[] {
  const data = dataOf(payload);
  const values = Array.isArray(data.files)
    ? data.files
    : Array.isArray(data.items)
      ? data.items
      : [];
  return values.flatMap(value => {
    if (!isObject(value)) return [];
    const name = scalarString(value.name);
    const token = scalarString(value.token) ?? scalarString(value.file_token);
    if (!name || !token) return [];
    return [
      {
        name,
        token,
        type: scalarString(value.type) ?? "file",
        sizeBytes: scalarNumber(value.size),
        modifiedAt:
          scalarString(value.modified_time) ??
          scalarString(value.modified_at) ??
          null,
      },
    ];
  });
}

async function listFolder(
  runner: LarkCliRunner,
  cwd: string,
  folderToken: string
) {
  const entries: RemoteEntry[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 100; page += 1) {
    const params: Record<string, unknown> = {
      folder_token: folderToken,
      page_size: 200,
    };
    if (pageToken) params.page_token = pageToken;
    const payload = await runCheckedLarkCli(
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
    entries.push(...entriesOf(payload));
    const data = dataOf(payload);
    if (data.has_more !== true) return entries;
    const next = scalarString(data.next_page_token);
    if (!next || next === pageToken)
      throw new Error("飞书团队收件箱分页信息无效");
    pageToken = next;
  }
  throw new Error("飞书团队收件箱内容超过安全分页上限");
}

async function resolveInbox(
  runner: LarkCliRunner,
  cwd: string,
  database: LocalDatabase
) {
  const config = readInternalStorageConfig(database);
  if (!config) throw new Error("飞书企业共享资料库尚未配置");
  assertEnterpriseSharedStorageScope(config);
  await verifyLarkUserAuthentication(runner, cwd);
  const matches = (
    await listFolder(runner, cwd, config.driveRootFolderToken)
  ).filter(
    entry => entry.name === FEISHU_TEAM_INBOX_NAME && entry.type === "folder"
  );
  if (matches.length === 0)
    throw new Error(`飞书企业共享资料库缺少“${FEISHU_TEAM_INBOX_NAME}”`);
  if (matches.length > 1)
    throw new Error("飞书企业共享资料库存在重名团队收件箱");
  return matches[0];
}

function isSupported(entry: RemoteEntry) {
  const extension = path.extname(entry.name).toLocaleLowerCase("en-US");
  return (
    entry.type === "file" &&
    SUPPORTED_EXTENSIONS.includes(extension) &&
    (entry.sizeBytes === null || entry.sizeBytes <= MAX_BP_BYTES)
  );
}

function localReceiptStillPresent(
  database: LocalDatabase,
  receipt: Record<string, unknown>
) {
  if (typeof receipt.file_id !== "string") return false;
  const file = database.getFile(receipt.file_id);
  if (!file || typeof file.stored_path !== "string") return false;
  try {
    return fs.existsSync(database.resolveStoredFile(file.stored_path));
  } catch {
    return false;
  }
}

function restoreMissingLocalOriginal(
  database: LocalDatabase,
  file: Record<string, unknown>,
  buffer: Buffer
) {
  if (typeof file.stored_path !== "string")
    throw new Error("本地文件记录缺少受控存储位置");
  const target = database.resolveStoredFile(file.stored_path);
  if (fs.existsSync(target)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.writeFileSync(target, buffer, { flag: "wx" });
  } catch (error) {
    if (!isObject(error) || error.code !== "EEXIST") throw error;
  }
  const restored = fs.readFileSync(target);
  const restoredHash = createHash("sha256").update(restored).digest("hex");
  const expectedHash = scalarString(file.sha256);
  if (!expectedHash || restoredHash !== expectedHash)
    throw new Error("飞书副本与本地文件记录不一致，拒绝修复");
  return true;
}

export async function planFeishuInboxPull(
  database: LocalDatabase = getDatabase(),
  options: { runner?: LarkCliRunner; cwd?: string } = {}
): Promise<FeishuInboxPlan> {
  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const inbox = await resolveInbox(runner, cwd, database);
  const entries = await listFolder(runner, cwd, inbox.token);
  return {
    inboxName: FEISHU_TEAM_INBOX_NAME,
    storageScope: "enterprise_shared",
    generatedAt: new Date().toISOString(),
    items: entries.map(entry => {
      if (!isSupported(entry))
        return {
          remoteName: entry.name,
          sizeBytes: entry.sizeBytes,
          modifiedAt: entry.modifiedAt,
          action: "unsupported" as const,
        };
      const receipt = database.getFeishuInboxReceipt(entry.token);
      if (!receipt)
        return {
          remoteName: entry.name,
          sizeBytes: entry.sizeBytes,
          modifiedAt: entry.modifiedAt,
          action: "download_and_import" as const,
        };
      const projectId =
        typeof receipt.project_id === "string" ? receipt.project_id : null;
      if (projectId && database.isProjectArchived(projectId))
        return {
          remoteName: entry.name,
          sizeBytes: entry.sizeBytes,
          modifiedAt: entry.modifiedAt,
          action: "restore_after_verification" as const,
        };
      const unchanged =
        entry.modifiedAt !== null &&
        (receipt.remote_modified_time ?? null) === entry.modifiedAt &&
        localReceiptStillPresent(database, receipt);
      return {
        remoteName: entry.name,
        sizeBytes: entry.sizeBytes,
        modifiedAt: entry.modifiedAt,
        action: unchanged
          ? ("skip_already_imported" as const)
          : ("download_and_import" as const),
      };
    }),
  };
}

function safeRemoteName(value: string) {
  const cleaned = path
    .basename(value)
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .trim();
  return (cleaned || "team-bp").slice(0, 180);
}

function verifiedTempDirectory(database: LocalDatabase) {
  const stagingRoot = path.resolve(database.dataDir, "feishu-inbox-staging");
  fs.mkdirSync(stagingRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(stagingRoot, "pull-"));
  if (!directory.startsWith(stagingRoot + path.sep))
    throw new Error("飞书下载暂存目录越界");
  return { stagingRoot, directory };
}

async function downloadEntry(
  runner: LarkCliRunner,
  entry: RemoteEntry,
  database: LocalDatabase
) {
  const { stagingRoot, directory } = verifiedTempDirectory(database);
  const outputName = safeRemoteName(entry.name);
  const outputPath = path.resolve(directory, outputName);
  if (!outputPath.startsWith(directory + path.sep))
    throw new Error("飞书下载文件名越界");
  try {
    await runCheckedLarkCli(
      runner,
      [
        "drive",
        "+download",
        "--as",
        "user",
        "--file-token",
        entry.token,
        "--output",
        outputName,
        "--format",
        "json",
      ],
      directory
    );
    if (!fs.existsSync(outputPath))
      throw new Error("飞书文件下载后未找到本地副本");
    const downloadedStat = fs.statSync(outputPath);
    if (!downloadedStat.isFile()) throw new Error("飞书下载结果不是普通文件");
    if (downloadedStat.size > MAX_BP_BYTES)
      throw new Error("飞书文件超过 50MB 限制");
    const buffer = fs.readFileSync(outputPath);
    if (buffer.length === 0) throw new Error("飞书文件为空");
    return {
      buffer,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
  } finally {
    const resolved = path.resolve(directory);
    if (resolved.startsWith(stagingRoot + path.sep))
      fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function pullUnlocked(
  input: { requestedBy: string },
  database: LocalDatabase,
  options: { runner?: LarkCliRunner; cwd?: string }
): Promise<FeishuInboxPullReceipt> {
  const requestedBy = input.requestedBy.trim();
  if (!requestedBy) throw new Error("同步必须记录使用者昵称");
  const runner = options.runner ?? new SpawnLarkCliRunner();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const startedAt = new Date().toISOString();
  const inbox = await resolveInbox(runner, cwd, database);
  const entries = await listFolder(runner, cwd, inbox.token);
  const ledger = new OperationLedger(database);
  const operation = ledger.start({
    operationType: "feishu_inbox_pull",
    actor: { kind: "codex", id: requestedBy, name: requestedBy },
    metadata: {
      inboxName: FEISHU_TEAM_INBOX_NAME,
      itemCount: entries.length,
      remoteDeleteAllowed: false,
      remoteOverwriteAllowed: false,
      serialExecution: true,
    },
  });
  const items: FeishuInboxPullItem[] = [];
  let downloaded = 0;
  let imported = 0;
  let restored = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!isSupported(entry)) {
      skipped += 1;
      items.push({
        remoteName: entry.name,
        status: "unsupported",
        projectId: null,
        versionNumber: null,
        message: "不是受支持的 BP 文件，或文件超过 50MB",
      });
      continue;
    }
    try {
      const receipt = database.getFeishuInboxReceipt(entry.token);
      const receiptProjectId =
        receipt && typeof receipt.project_id === "string"
          ? receipt.project_id
          : null;
      const archived = receiptProjectId
        ? database.isProjectArchived(receiptProjectId)
        : false;
      const unchanged =
        receipt &&
        !archived &&
        entry.modifiedAt !== null &&
        (receipt.remote_modified_time ?? null) === entry.modifiedAt &&
        localReceiptStillPresent(database, receipt);
      if (unchanged) {
        skipped += 1;
        items.push({
          remoteName: entry.name,
          status: "skipped_unchanged",
          projectId: receiptProjectId,
          versionNumber:
            typeof receipt.version_number === "number"
              ? receipt.version_number
              : null,
          message: "此前已同步且远端未变化",
        });
        continue;
      }

      const downloadedFile = await downloadEntry(runner, entry, database);
      downloaded += 1;
      const existing = database.findFileByHash(downloadedFile.sha256);
      if (existing) {
        const localOriginalRestored = restoreMissingLocalOriginal(
          database,
          existing,
          downloadedFile.buffer
        );
        const wasArchived = database.isProjectArchived(existing.project_id);
        if (wasArchived) {
          restoreLocalProject(
            {
              projectId: existing.project_id,
              requestedBy,
              source: "system",
              note: "从飞书团队收件箱重新下载并校验原文件后恢复",
            },
            database
          );
          restored += 1;
        } else {
          skipped += 1;
        }
        database.upsertFeishuInboxReceipt({
          remoteFileToken: entry.token,
          remoteName: entry.name,
          remoteModifiedTime: entry.modifiedAt,
          sha256: downloadedFile.sha256,
          projectId: existing.project_id,
          fileId: existing.id,
          versionNumber: Number(existing.version_number),
          status: wasArchived ? "restored" : "skipped_duplicate",
          importedAt: new Date().toISOString(),
        });
        items.push({
          remoteName: entry.name,
          status: wasArchived ? "restored" : "skipped_duplicate",
          projectId: existing.project_id,
          versionNumber: Number(existing.version_number),
          message: wasArchived
            ? "远端字节校验一致，项目已从回收站恢复"
            : localOriginalRestored
              ? "远端字节校验一致，本地缺失原件已恢复"
              : "相同原文件已经在本地，未重复创建版本",
        });
        continue;
      }

      const result = await importDocument(
        { buffer: downloadedFile.buffer, originalName: entry.name },
        database
      );
      imported += result.duplicate ? 0 : 1;
      skipped += result.duplicate ? 1 : 0;
      restored += result.restoredFromRecycleBin ? 1 : 0;
      const status = result.restoredFromRecycleBin
        ? "restored"
        : result.duplicate
          ? "skipped_duplicate"
          : "imported";
      database.upsertFeishuInboxReceipt({
        remoteFileToken: entry.token,
        remoteName: entry.name,
        remoteModifiedTime: entry.modifiedAt,
        sha256: downloadedFile.sha256,
        projectId: result.projectId,
        fileId: result.fileId,
        versionNumber: result.versionNumber,
        status,
        importedAt: new Date().toISOString(),
      });
      items.push({
        remoteName: entry.name,
        status,
        projectId: result.projectId,
        versionNumber: result.versionNumber,
        message: result.restoredFromRecycleBin
          ? "项目已恢复并追加最新 BP 版本"
          : result.duplicate
            ? "相同原文件已经在本地"
            : `已导入为 v${result.versionNumber}`,
      });
    } catch (error) {
      failed += 1;
      items.push({
        remoteName: entry.name,
        status: "failed",
        projectId: null,
        versionNumber: null,
        message: sanitizeLarkCliError(
          error instanceof Error ? error.message : String(error)
        ),
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const summary = { downloaded, imported, restored, skipped, failed };
  if (failed === 0) ledger.succeed(operation.operationId, summary);
  else if (failed < entries.length)
    ledger.markPartial(
      operation.operationId,
      { code: "FEISHU_INBOX_PARTIAL", message: "部分团队文件未能导入" },
      summary
    );
  else
    ledger.fail(
      operation.operationId,
      { code: "FEISHU_INBOX_FAILED", message: "团队收件箱没有文件成功处理" },
      summary
    );
  return {
    inboxName: FEISHU_TEAM_INBOX_NAME,
    requestedBy,
    startedAt,
    finishedAt,
    ...summary,
    items,
  };
}

export async function pullFeishuInbox(
  input: { requestedBy: string },
  database: LocalDatabase = getDatabase(),
  options: { runner?: LarkCliRunner; cwd?: string } = {}
) {
  const previous = inboxPullQueue;
  let release: () => void = () => undefined;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  inboxPullQueue = previous.catch(() => undefined).then(() => current);
  await previous.catch(() => undefined);
  try {
    return await pullUnlocked(input, database, options);
  } finally {
    release();
  }
}
