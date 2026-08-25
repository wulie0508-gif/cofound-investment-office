import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  FeishuInternalStorageConfig,
  FeishuProjectSyncInput,
  FeishuProjectSyncPlan,
  FeishuProjectSyncPreflight,
  FeishuProjectSyncReceipt,
  FeishuStorageScope,
} from "../../shared/feishu-sync";
import type { OperationSummary } from "../../shared/operation-ledger";
import { getDatabase, type LocalDatabase } from "./database";
import {
  planFeishuProjectSync,
  preflightFeishuProjectSync,
  SpawnLarkCliRunner,
  syncProjectToFeishu,
  type LarkCliRunner,
} from "./feishu-sync";
import { OperationLedger } from "./operation-ledger";

type Row = Record<string, unknown>;

const projectSyncLocks = new Map<string, Promise<void>>();

/**
 * A single local service may receive confirmations from several Codex/MCP
 * processes. Serialize writes for the same project so they cannot both pass
 * the remote dedupe check before either one creates the index record.
 */
export async function withProjectFeishuSyncLock<T>(
  projectId: string,
  operation: () => Promise<T>
) {
  const previous = projectSyncLocks.get(projectId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  projectSyncLocks.set(projectId, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (projectSyncLocks.get(projectId) === queued)
      projectSyncLocks.delete(projectId);
  }
}

export function summarizeInternalStorageOperations(
  syncOperations: OperationSummary[],
  storageBinding?: string
) {
  const scopedOperations = storageBinding
    ? syncOperations.filter(
        operation => operation.metadata.storageBinding === storageBinding
      )
    : syncOperations;
  const latestByProject = new Map<string, OperationSummary>();
  const latestSuccessByProject = new Map<string, OperationSummary>();
  for (const operation of scopedOperations) {
    if (!operation.projectId) continue;
    if (!latestByProject.has(operation.projectId))
      latestByProject.set(operation.projectId, operation);
    if (
      operation.status === "succeeded" &&
      !latestSuccessByProject.has(operation.projectId)
    )
      latestSuccessByProject.set(operation.projectId, operation);
  }
  const currentStates = [...latestByProject.values()];
  const successfulSnapshots = [...latestSuccessByProject.values()];
  return {
    projectCount: successfulSnapshots.length,
    fileCount: successfulSnapshots.reduce((sum, item) => {
      const value = item.metadata.itemCount;
      return sum + (typeof value === "number" ? value : 0);
    }, 0),
    pendingCount: currentStates.filter(item => item.status === "started")
      .length,
    failedCount: currentStates.filter(item => item.status === "failed").length,
    lastSyncAt:
      scopedOperations.find(item => item.status === "succeeded")?.finishedAt ??
      null,
  };
}

export type InternalStorageConfigFile = FeishuInternalStorageConfig & {
  driveRootName?: string;
  driveRootUrl?: string;
  indexName?: string;
  baseUrl?: string;
};

const STORAGE_SCOPES = new Set<FeishuStorageScope>([
  "enterprise_shared",
  "personal",
  "unknown",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readInternalStorageConfig(
  database: LocalDatabase
): InternalStorageConfigFile | null {
  const configuredPath = process.env.COF_BP_FEISHU_CONFIG;
  const absolute = path.resolve(
    configuredPath ||
      path.join(database.dataDir, "feishu-internal-storage.json")
  );
  if (!fs.existsSync(absolute)) return null;
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8")) as unknown;
  if (!isObject(parsed)) throw new Error("飞书内部资料配置必须是 JSON 对象");
  const required = [
    "driveRootFolderToken",
    "baseToken",
    "baseTableId",
  ] as const;
  for (const key of required)
    if (typeof parsed[key] !== "string" || !parsed[key].trim())
      throw new Error(`飞书内部资料配置缺少 ${key}`);
  if (
    parsed.storageScope !== undefined &&
    (typeof parsed.storageScope !== "string" ||
      !STORAGE_SCOPES.has(parsed.storageScope as FeishuStorageScope))
  )
    throw new Error("飞书内部资料配置的 storageScope 无效");
  return parsed as InternalStorageConfigFile;
}

export function assertEnterpriseSharedStorageScope(
  config: InternalStorageConfigFile
) {
  if (config.storageScope !== "enterprise_shared")
    throw new Error("正式内部同步只允许使用已核验的企业共享目录");
}

function createInternalStorageBinding(config: FeishuInternalStorageConfig) {
  return createHash("sha256")
    .update(
      [config.driveRootFolderToken, config.baseToken, config.baseTableId].join(
        "\u0000"
      )
    )
    .digest("hex");
}

function sourceFiles(database: LocalDatabase, projectId: string) {
  const bpRows = database.connection
    .prepare(
      `SELECT id, original_name, stored_path, mime_type, size_bytes, sha256,
              version_number, created_at
       FROM project_files WHERE project_id = ? ORDER BY version_number`
    )
    .all(projectId) as Row[];
  const materialRows = database.connection
    .prepare(
      `SELECT id, original_name, stored_path, mime_type, size_bytes, sha256,
              category, created_at
       FROM project_materials
       WHERE project_id = ? AND state = 'attached' ORDER BY created_at`
    )
    .all(projectId) as Row[];
  return [
    ...bpRows.map(row => ({
      fileId: String(row.id),
      kind: "bp" as const,
      category: "BP",
      versionNumber: Number(row.version_number),
      originalName: String(row.original_name),
      absolutePath: database.resolveStoredFile(String(row.stored_path)),
      sha256: String(row.sha256),
      sizeBytes: Number(row.size_bytes),
      mimeType: String(row.mime_type),
      createdAt: String(row.created_at),
    })),
    ...materialRows.map(row => ({
      fileId: String(row.id),
      kind: "material" as const,
      category: String(row.category),
      versionNumber: null,
      originalName: String(row.original_name),
      absolutePath: database.resolveStoredFile(String(row.stored_path)),
      sha256: String(row.sha256),
      sizeBytes: Number(row.size_bytes),
      mimeType: String(row.mime_type),
      createdAt: String(row.created_at),
    })),
  ];
}

function buildPlan(
  projectId: string,
  requestedBy: string,
  database: LocalDatabase
) {
  const config = readInternalStorageConfig(database);
  if (!config) throw new Error("飞书内部资料尚未配置");
  assertEnterpriseSharedStorageScope(config);
  const project = database.getProject(projectId);
  if (!project) throw new Error("项目不存在");
  if (database.isProjectArchived(projectId))
    throw new Error("项目位于回收站，请先恢复后再同步到飞书");
  const files = sourceFiles(database, projectId);
  if (files.length === 0) throw new Error("项目没有可同步的 BP 或补充材料");
  const input: FeishuProjectSyncInput = {
    project: { id: project.id, name: project.name },
    files,
    requestedBy,
  };
  return {
    plan: planFeishuProjectSync(config, input),
    driveRootName: config.driveRootName ?? "Cofound Investment Office",
    storageBinding: createInternalStorageBinding(config),
  };
}

export function createFeishuConfirmationPlan(
  plan: FeishuProjectSyncPlan,
  preflight: FeishuProjectSyncPreflight,
  driveRootName: string
) {
  const actionByFile = new Map(
    preflight.items.map(item => [item.fileId, item.action] as const)
  );
  if (
    actionByFile.size !== plan.items.length ||
    plan.items.some(item => !actionByFile.has(item.fileId))
  )
    throw new Error("飞书同步预检结果与当前计划不一致，请重新生成计划");
  return {
    schemaVersion: plan.schemaVersion,
    // planId and requestedBy are transport-only confirmation bindings. The MCP
    // stores them privately and never includes them in the human summary.
    planId: plan.planId,
    generatedAt: plan.generatedAt,
    project: plan.project,
    requestedBy: plan.requestedBy,
    targetFolder: `${driveRootName} / ${plan.folderLayout.projectFolderName}`,
    items: plan.items.map(item => ({
      fileId: item.fileId,
      fileType: item.kind === "bp" ? ("BP" as const) : ("补充材料" as const),
      category: item.category,
      fileName: item.originalName,
      bpVersion: item.kind === "bp" ? item.versionNumber : null,
      expectedAction: actionByFile.get(item.fileId),
    })),
  };
}

function publicReceipt(receipt: FeishuProjectSyncReceipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    projectId: receipt.projectId,
    requestedBy: receipt.requestedBy,
    status: receipt.status,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
    writes: receipt.writes,
    verification: receipt.verification,
    items: receipt.items.map(item => ({
      fileId: item.fileId,
      status: item.status,
      driveUrl: item.driveUrl,
      readBackVerified: item.readBackVerified,
      error: item.error,
    })),
    error: receipt.error,
  };
}

export async function planProjectFeishuSync(
  projectId: string,
  requestedBy: string,
  database: LocalDatabase = getDatabase(),
  options: { runner?: LarkCliRunner; cwd?: string } = {}
) {
  if (!requestedBy.trim()) throw new Error("同步必须记录操作者昵称");
  const { plan, driveRootName } = buildPlan(
    projectId,
    requestedBy.trim(),
    database
  );
  const preflight = await preflightFeishuProjectSync(plan, options);
  return createFeishuConfirmationPlan(plan, preflight, driveRootName);
}

export async function executeProjectFeishuSync(
  input: {
    projectId: string;
    requestedBy: string;
    planId: string;
    confirmed: true;
  },
  database: LocalDatabase = getDatabase()
) {
  if (input.confirmed !== true) throw new Error("执行飞书同步前必须确认计划");
  return withProjectFeishuSyncLock(input.projectId, async () => {
    const { plan, storageBinding } = buildPlan(
      input.projectId,
      input.requestedBy.trim(),
      database
    );
    if (plan.planId !== input.planId)
      throw new Error("同步计划已经变化，请重新生成计划后确认");
    const ledger = new OperationLedger(database);
    const operation = ledger.start({
      operationType: "feishu_sync",
      projectId: input.projectId,
      actor: {
        kind: "codex",
        id: input.requestedBy.trim(),
        name: input.requestedBy.trim(),
      },
      metadata: {
        planId: plan.planId,
        itemCount: plan.items.length,
        storageBinding,
        retainEveryVersion: true,
        overwriteAllowed: false,
        deleteAllowed: false,
      },
    });
    const receipt = await syncProjectToFeishu(plan, { cwd: process.cwd() });
    if (receipt.status === "succeeded") {
      ledger.succeed(operation.operationId, {
        receiptId: receipt.receiptId,
        itemCount: receipt.items.length,
        filesUploaded: receipt.writes.filesUploaded,
        indexRecordsCreated: receipt.writes.indexRecordsCreated,
        foldersCreated: receipt.writes.foldersCreated,
        readBackChecks: receipt.verification.readBackChecks,
      });
    } else {
      ledger.fail(
        operation.operationId,
        {
          code: "FEISHU_SYNC_FAILED",
          message: receipt.error ?? "飞书同步失败",
        },
        {
          receiptId: receipt.receiptId,
          itemCount: receipt.items.length,
          filesUploaded: receipt.writes.filesUploaded,
          indexRecordsCreated: receipt.writes.indexRecordsCreated,
        }
      );
    }
    return publicReceipt(receipt);
  });
}

export async function getInternalStorageStatus(
  database: LocalDatabase = getDatabase()
) {
  const config = readInternalStorageConfig(database);
  if (!config)
    return {
      connectionState: "not_configured" as const,
      storageScope: "unknown" as const,
      operations: [],
    };

  const runner = new SpawnLarkCliRunner();
  const auth = await runner.run(["auth", "status", "--json", "--verify"], {
    cwd: process.cwd(),
  });
  let verified = false;
  try {
    const payload = JSON.parse(auth.stdout) as Record<string, unknown>;
    verified = auth.exitCode === 0 && payload.verified === true;
  } catch {
    verified = false;
  }
  const ledger = new OperationLedger(database);
  const syncOperations = ledger.listOperations({
    operationType: "feishu_sync",
    limit: 500,
  });
  const summary = summarizeInternalStorageOperations(
    syncOperations,
    createInternalStorageBinding(config)
  );

  return {
    connectionState: verified
      ? ("connected" as const)
      : ("unavailable" as const),
    storageScope: config.storageScope ?? ("unknown" as const),
    driveRootName: config.driveRootName ?? "Cofound Investment Office",
    driveRootUrl: config.driveRootUrl ?? null,
    indexName: config.indexName ?? "Cofound 内部项目索引",
    baseUrl: config.baseUrl ?? null,
    ...summary,
  };
}
