import { randomUUID } from "node:crypto";
import type {
  CodexInvestmentAnalysisResult,
  CodexInvestmentAnalysisSkill,
} from "../../shared/bp";
import { getDatabase, type LocalDatabase } from "./database";
import { OperationLedger } from "./operation-ledger";

export type PrepareCodexAnalysisInput = {
  projectId: string;
  skillName: CodexInvestmentAnalysisSkill;
  requestedBy: string;
  force?: boolean;
  taskId?: string;
};

export type CompleteCodexAnalysisInput = {
  runId: string;
  modelName: string;
  result: CodexInvestmentAnalysisResult;
};

function operationId(runId: string) {
  return `codex_analysis_${runId}`;
}

function retryOperationId(runId: string) {
  return `${operationId(runId)}_retry_${randomUUID()}`;
}

function successfulAttemptForRun(
  ledger: OperationLedger,
  runId: string,
  projectId: string | null
) {
  return ledger
    .listOperations({
      operationType: "analysis",
      projectId: projectId ?? undefined,
      limit: 500,
    })
    .find(
      item =>
        item.status === "succeeded" && item.metadata.analysisRunId === runId
    );
}

export function prepareCodexAnalysis(
  input: PrepareCodexAnalysisInput,
  database: LocalDatabase = getDatabase(),
  ledger: OperationLedger = new OperationLedger(database)
) {
  const run = database.prepareCodexAnalysis(input);
  const id = operationId(run.id);
  if (!ledger.getOperation(id)) {
    ledger.start({
      operationId: id,
      operationType: "analysis",
      projectId: run.projectId,
      fileHash: run.sourceFileSha256,
      actor: {
        kind: "codex",
        id: input.requestedBy.trim(),
        name: input.requestedBy.trim(),
      },
      skill: { name: run.skillName, version: run.skillVersion },
      promptVersion: run.promptVersion,
      metadata: {
        analysisRunId: run.id,
        factSnapshotHash: run.factSnapshotHash,
        projectLocalVersion: run.projectLocalVersion,
        sourceTaskId: run.sourceTaskId,
        hasUserPrompt: Boolean(run.requestContext?.userPrompt),
      },
    });
  }
  return run;
}

export function completeCodexAnalysis(
  input: CompleteCodexAnalysisInput,
  database: LocalDatabase = getDatabase(),
  ledger: OperationLedger = new OperationLedger(database)
) {
  const id = operationId(input.runId);
  let operation = ledger.getOperation(id);
  if (!operation) {
    const source = database.getPreparedCodexAnalysisSource(input.runId);
    ledger.start({
      operationId: id,
      operationType: "analysis",
      fileHash: source.sourceFileSha256,
      actor: { kind: "codex", id: "local-codex" },
      metadata: {
        analysisRunId: input.runId,
        sourceFileId: source.sourceFileId,
      },
    });
    operation = ledger.getOperation(id);
  }

  let activeOperationId = id;
  if (
    operation &&
    operation.summary.status !== "started" &&
    operation.summary.status !== "succeeded"
  ) {
    const previous = operation.summary;
    const successfulAttempt = successfulAttemptForRun(
      ledger,
      input.runId,
      previous.projectId
    );
    if (successfulAttempt) {
      activeOperationId = successfulAttempt.operationId;
      operation = ledger.getOperation(activeOperationId);
    } else {
      activeOperationId = retryOperationId(input.runId);
      ledger.start({
        operationId: activeOperationId,
        operationType: "analysis",
        projectId: previous.projectId ?? undefined,
        fileHash: previous.fileHash ?? undefined,
        actor: previous.actor,
        skill: previous.skill ?? undefined,
        promptVersion: previous.promptVersion ?? undefined,
        metadata: {
          ...previous.metadata,
          analysisRunId: input.runId,
          retryOf: id,
        },
      });
      operation = ledger.getOperation(activeOperationId);
    }
  }

  try {
    const run = database.completeCodexAnalysis(input);
    if (operation?.summary.status === "started") {
      ledger.finish(activeOperationId, {
        status: "succeeded",
        model: input.modelName,
        metadata: {
          aiSuggestion: run.result?.aiSuggestion ?? null,
          confidence: run.result?.confidence ?? null,
          completedRunId: run.id,
        },
      });
    }
    return run;
  } catch (error) {
    if (operation?.summary.status === "started") {
      ledger.fail(activeOperationId, {
        code: "CODEX_ANALYSIS_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}
