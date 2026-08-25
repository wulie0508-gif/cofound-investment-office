import type {
  FeishuFeedbackAdapterErrorCode,
  FeishuProductFeedbackConfig,
} from "../../shared/feishu-feedback";
import type {
  ProductFeedbackIngestRemoteInput,
  ProductFeedbackMarkFailedInput,
  ProductFeedbackMarkSyncedInput,
  ProductFeedbackOutboxDto,
  ProductFeedbackPendingOutboxInput,
} from "../../shared/product-feedback";
import { getDatabase, type LocalDatabase } from "./database";
import {
  FeishuFeedbackAdapterError,
  preflightFeishuProductFeedback,
  pullFeishuMaintenanceInbox,
  pullFeishuMaintenanceUpdatesForOriginKeys,
  syncProductFeedbackRecord,
} from "./feishu-feedback";
import type { LarkCliRunner } from "./feishu-sync";
import { readInternalStorageConfig } from "./feishu-sync-service";
import { OperationLedger } from "./operation-ledger";
import {
  getProductFeedbackService,
  type ProductFeedbackService,
} from "./product-feedback-service";

export type ProductFeedbackSyncPort = Pick<
  ProductFeedbackService,
  | "capabilities"
  | "pendingOutbox"
  | "pendingOutboxForFeedback"
  | "markOutboxSynced"
  | "markOutboxFailed"
  | "ingestRemote"
  | "trackedOriginKeys"
  | "applyRemoteMaintenanceUpdate"
>;

export type ProductFeedbackSyncServiceErrorCode =
  | FeishuFeedbackAdapterErrorCode
  | "maintainer_required"
  | "local_feedback_service_failed";

export type ProductFeedbackSyncItemResult = {
  outboxId: string;
  feedbackId: string;
  status: "synced" | "failed";
  action: "created" | "updated" | "skipped_existing" | null;
  errorCode: ProductFeedbackSyncServiceErrorCode | null;
};

export type ProductFeedbackSyncBatchResult = {
  status: "not_configured" | "succeeded" | "partial" | "failed";
  attempted: number;
  succeeded: number;
  failed: number;
  items: ProductFeedbackSyncItemResult[];
  errorCode: ProductFeedbackSyncServiceErrorCode | null;
};

export type MaintenanceInboxRefreshResult = {
  status: "not_configured" | "succeeded" | "partial" | "failed";
  received: number;
  ingested: number;
  ignored: number;
  failed: number;
  pageCount: number;
  readAt: string | null;
  errorCode: ProductFeedbackSyncServiceErrorCode | null;
};

export type ReporterMaintenanceRefreshResult = {
  status: "not_configured" | "succeeded" | "partial" | "failed";
  tracked: number;
  received: number;
  applied: number;
  failed: number;
  queryCount: number;
  readAt: string | null;
  errorCode: ProductFeedbackSyncServiceErrorCode | null;
};

function adapterErrorCode(error: unknown): ProductFeedbackSyncServiceErrorCode {
  return error instanceof FeishuFeedbackAdapterError
    ? error.code
    : "local_feedback_service_failed";
}

function ledgerErrorCode(code: ProductFeedbackSyncServiceErrorCode) {
  return `FEISHU_PRODUCT_FEEDBACK_${code.toUpperCase()}`;
}

export function resolveFeishuProductFeedbackConfig(
  database: LocalDatabase
): FeishuProductFeedbackConfig | null {
  let config: ReturnType<typeof readInternalStorageConfig>;
  try {
    config = readInternalStorageConfig(database);
  } catch {
    return null;
  }
  const tableId = config?.feedbackTableId?.trim();
  if (!config || !tableId) return null;
  const baseToken = config.feedbackBaseToken?.trim() || config.baseToken.trim();
  if (
    !baseToken ||
    /\s/u.test(baseToken) ||
    /\s/u.test(tableId) ||
    /^https?:\/\//iu.test(baseToken) ||
    /^https?:\/\//iu.test(tableId)
  )
    return null;
  return { baseToken, tableId };
}

function pendingOutbox(
  feedbackService: ProductFeedbackSyncPort,
  limit: number,
  feedbackId?: string
) {
  if (feedbackId)
    return feedbackService.pendingOutboxForFeedback(
      feedbackId,
      limit
    ) as ProductFeedbackOutboxDto[];
  const input: Partial<ProductFeedbackPendingOutboxInput> = { limit };
  return feedbackService.pendingOutbox(input) as ProductFeedbackOutboxDto[];
}

export async function syncPendingFeedback(
  feedbackService: ProductFeedbackSyncPort = getProductFeedbackService(),
  options: {
    database?: LocalDatabase;
    runner?: LarkCliRunner;
    cwd?: string;
    limit?: number;
    feedbackId?: string;
    waitForRetry?: (delay: number) => Promise<void>;
  } = {}
): Promise<ProductFeedbackSyncBatchResult> {
  const database = options.database ?? getDatabase();
  const config = resolveFeishuProductFeedbackConfig(database);
  if (!config)
    return {
      status: "not_configured",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      items: [],
      errorCode: null,
    };

  const outbox = pendingOutbox(
    feedbackService,
    Math.min(Math.max(options.limit ?? 50, 1), 200),
    options.feedbackId
  );
  if (outbox.length === 0)
    return {
      status: "succeeded",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      items: [],
      errorCode: null,
    };

  try {
    await preflightFeishuProductFeedback(config, {
      runner: options.runner,
      cwd: options.cwd,
    });
  } catch (error) {
    const code = adapterErrorCode(error);
    for (const item of outbox) {
      try {
        feedbackService.markOutboxFailed({
          outboxId: item.id,
          error: code,
        } satisfies ProductFeedbackMarkFailedInput);
      } catch {
        // The batch result remains safe and failed; local service details stay local.
      }
    }
    return {
      status: "failed",
      attempted: outbox.length,
      succeeded: 0,
      failed: outbox.length,
      items: outbox.map(item => ({
        outboxId: item.id,
        feedbackId: item.feedbackId,
        status: "failed",
        action: null,
        errorCode: code,
      })),
      errorCode: code,
    };
  }

  const ledger = new OperationLedger(database);
  const items: ProductFeedbackSyncItemResult[] = [];
  for (const item of outbox) {
    const operation = ledger.start({
      operationType: "product_feedback_sync",
      actor: { kind: "system", id: "feishu-feedback-adapter" },
      metadata: {
        direction: "push",
        outboxId: item.id,
        feedbackId: item.feedbackId,
        kind: item.kind,
        sequence: item.sequence,
      },
    });
    try {
      const receipt = await syncProductFeedbackRecord(config, item.payload, {
        runner: options.runner,
        cwd: options.cwd,
        preflight: false,
        waitForRetry: options.waitForRetry,
      });
      feedbackService.markOutboxSynced({
        outboxId: item.id,
        remoteRecordId: receipt.recordId,
      } satisfies ProductFeedbackMarkSyncedInput);
      ledger.succeed(operation.operationId, {
        direction: "push",
        outboxId: item.id,
        feedbackId: item.feedbackId,
        action: receipt.action,
        readBackChecks: receipt.readBackChecks,
      });
      items.push({
        outboxId: item.id,
        feedbackId: item.feedbackId,
        status: "synced",
        action: receipt.action,
        errorCode: null,
      });
    } catch (error) {
      const code = adapterErrorCode(error);
      try {
        feedbackService.markOutboxFailed({
          outboxId: item.id,
          error: code,
        } satisfies ProductFeedbackMarkFailedInput);
      } catch {
        // The adapter never exposes the local service exception.
      }
      ledger.fail(operation.operationId, {
        code: ledgerErrorCode(code),
        message: code,
      });
      items.push({
        outboxId: item.id,
        feedbackId: item.feedbackId,
        status: "failed",
        action: null,
        errorCode: code,
      });
    }
  }
  const succeeded = items.filter(item => item.status === "synced").length;
  const failed = items.length - succeeded;
  return {
    status: failed === 0 ? "succeeded" : succeeded === 0 ? "failed" : "partial",
    attempted: items.length,
    succeeded,
    failed,
    items,
    errorCode:
      failed > 0
        ? (items.find(item => item.errorCode)?.errorCode ?? null)
        : null,
  };
}

export async function refreshMaintenanceInbox(
  feedbackService: ProductFeedbackSyncPort = getProductFeedbackService(),
  options: {
    database?: LocalDatabase;
    runner?: LarkCliRunner;
    cwd?: string;
    now?: Date;
  } = {}
): Promise<MaintenanceInboxRefreshResult> {
  if (!feedbackService.capabilities().maintainerMode)
    return {
      status: "failed",
      received: 0,
      ingested: 0,
      ignored: 0,
      failed: 0,
      pageCount: 0,
      readAt: null,
      errorCode: "maintainer_required",
    };
  const database = options.database ?? getDatabase();
  const config = resolveFeishuProductFeedbackConfig(database);
  if (!config)
    return {
      status: "not_configured",
      received: 0,
      ingested: 0,
      ignored: 0,
      failed: 0,
      pageCount: 0,
      readAt: null,
      errorCode: null,
    };

  const ledger = new OperationLedger(database);
  const operation = ledger.start({
    operationType: "product_feedback_sync",
    actor: { kind: "system", id: "feishu-feedback-adapter" },
    metadata: { direction: "pull" },
  });
  try {
    const snapshot = await pullFeishuMaintenanceInbox(config, {
      runner: options.runner,
      cwd: options.cwd,
      now: options.now,
    });
    let ingested = 0;
    let ignored = 0;
    let failed = 0;
    for (const item of snapshot.items) {
      if (item.payload.kind === "maintenance_update") {
        ignored += 1;
        continue;
      }
      try {
        feedbackService.ingestRemote({
          payload: item.payload,
          remoteRecordId: item.recordId,
        } satisfies ProductFeedbackIngestRemoteInput);
        ingested += 1;
      } catch {
        failed += 1;
      }
    }
    const status =
      failed === 0 ? "succeeded" : ingested === 0 ? "failed" : "partial";
    if (status === "succeeded")
      ledger.succeed(operation.operationId, {
        direction: "pull",
        recordCount: snapshot.items.length,
        ingestedCount: ingested,
        ignoredCount: ignored,
        pageCount: snapshot.pageCount,
      });
    else
      ledger.markPartial(
        operation.operationId,
        {
          code: ledgerErrorCode("local_feedback_service_failed"),
          message: "local_feedback_service_failed",
        },
        {
          direction: "pull",
          recordCount: snapshot.items.length,
          ingestedCount: ingested,
          ignoredCount: ignored,
          failedCount: failed,
          pageCount: snapshot.pageCount,
        }
      );
    return {
      status,
      received: snapshot.items.length,
      ingested,
      ignored,
      failed,
      pageCount: snapshot.pageCount,
      readAt: snapshot.readAt,
      errorCode: failed > 0 ? "local_feedback_service_failed" : null,
    };
  } catch (error) {
    const code = adapterErrorCode(error);
    ledger.fail(operation.operationId, {
      code: ledgerErrorCode(code),
      message: code,
    });
    return {
      status: "failed",
      received: 0,
      ingested: 0,
      ignored: 0,
      failed: 0,
      pageCount: 0,
      readAt: null,
      errorCode: code,
    };
  }
}

export async function refreshReporterMaintenanceUpdates(
  feedbackService: ProductFeedbackSyncPort = getProductFeedbackService(),
  options: {
    database?: LocalDatabase;
    runner?: LarkCliRunner;
    cwd?: string;
    now?: Date;
  } = {}
): Promise<ReporterMaintenanceRefreshResult> {
  const database = options.database ?? getDatabase();
  const config = resolveFeishuProductFeedbackConfig(database);
  if (!config)
    return {
      status: "not_configured",
      tracked: 0,
      received: 0,
      applied: 0,
      failed: 0,
      queryCount: 0,
      readAt: null,
      errorCode: null,
    };

  const tracked = feedbackService.trackedOriginKeys();
  const ledger = new OperationLedger(database);
  const operation = ledger.start({
    operationType: "product_feedback_sync",
    actor: { kind: "system", id: "feishu-feedback-adapter" },
    metadata: {
      direction: "pull_maintenance_updates",
      tracked: tracked.length,
    },
  });
  try {
    const snapshot = await pullFeishuMaintenanceUpdatesForOriginKeys(
      config,
      tracked.map(item => item.originKey),
      {
        runner: options.runner,
        cwd: options.cwd,
        now: options.now,
      }
    );
    let applied = 0;
    let failed = 0;
    for (const item of snapshot.items) {
      try {
        feedbackService.applyRemoteMaintenanceUpdate({
          payload: item.payload,
          remoteRecordId: item.recordId,
        } satisfies ProductFeedbackIngestRemoteInput);
        applied += 1;
      } catch {
        failed += 1;
      }
    }
    const status =
      failed === 0 ? "succeeded" : applied === 0 ? "failed" : "partial";
    const safeMetadata = {
      direction: "pull_maintenance_updates",
      tracked: tracked.length,
      received: snapshot.items.length,
      applied,
      failed,
      queryCount: snapshot.queryCount,
    };
    if (status === "succeeded")
      ledger.succeed(operation.operationId, safeMetadata);
    else
      ledger.markPartial(
        operation.operationId,
        {
          code: ledgerErrorCode("local_feedback_service_failed"),
          message: "local_feedback_service_failed",
        },
        safeMetadata
      );
    return {
      status,
      tracked: tracked.length,
      received: snapshot.items.length,
      applied,
      failed,
      queryCount: snapshot.queryCount,
      readAt: snapshot.readAt,
      errorCode: failed > 0 ? "local_feedback_service_failed" : null,
    };
  } catch (error) {
    const code = adapterErrorCode(error);
    ledger.fail(operation.operationId, {
      code: ledgerErrorCode(code),
      message: code,
    });
    return {
      status: "failed",
      tracked: tracked.length,
      received: 0,
      applied: 0,
      failed: 0,
      queryCount: 0,
      readAt: null,
      errorCode: code,
    };
  }
}
