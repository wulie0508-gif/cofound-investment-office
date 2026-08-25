import { getDatabase, type LocalDatabase } from "./database";
import { OperationLedger } from "./operation-ledger";

type LifecycleInput = {
  projectId: string;
  requestedBy: string;
};

function actorName(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("操作必须记录使用者昵称");
  return normalized.slice(0, 120);
}

export function archiveLocalProject(
  input: LifecycleInput,
  database: LocalDatabase = getDatabase()
) {
  const requestedBy = actorName(input.requestedBy);
  const project = database.getProject(input.projectId);
  if (!project) throw new Error("项目不存在");
  const ledger = new OperationLedger(database);
  const operation = ledger.start({
    operationType: "project_archive",
    projectId: input.projectId,
    actor: { kind: "human", id: requestedBy, name: requestedBy },
    metadata: {
      localFilesRetained: true,
      analysisHistoryRetained: true,
      feishuFilesChanged: false,
      externalSharesChanged: false,
    },
  });
  try {
    const changed = database.archiveProject(input.projectId);
    ledger.succeed(operation.operationId, { changed });
    return {
      projectId: input.projectId,
      projectName: project.name,
      changed,
      state: "in_recycle_bin" as const,
      localFilesRetained: true,
      analysisHistoryRetained: true,
      feishuFilesChanged: false,
      externalSharesChanged: false,
    };
  } catch (error) {
    ledger.fail(operation.operationId, {
      code: "PROJECT_ARCHIVE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function restoreLocalProject(
  input: LifecycleInput & { source?: "human" | "system"; note?: string },
  database: LocalDatabase = getDatabase()
) {
  const requestedBy = actorName(input.requestedBy);
  const project = database.getProject(input.projectId);
  if (!project) throw new Error("项目不存在");
  const ledger = new OperationLedger(database);
  const operation = ledger.start({
    operationType: "project_restore",
    projectId: input.projectId,
    actor: {
      kind: input.source === "system" ? "system" : "human",
      id: requestedBy,
      name: requestedBy,
    },
    metadata: {
      localFilesRetained: true,
      restoredFromRecycleBin: true,
      feishuFilesChanged: false,
    },
  });
  try {
    const changed = database.restoreProject(
      input.projectId,
      input.note,
      input.source ?? "human"
    );
    ledger.succeed(operation.operationId, { changed });
    return {
      projectId: input.projectId,
      projectName: project.name,
      changed,
      state: "active" as const,
    };
  } catch (error) {
    ledger.fail(operation.operationId, {
      code: "PROJECT_RESTORE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
