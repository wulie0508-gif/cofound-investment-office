import type { OperationStatus, OperationType } from "@shared/operation-ledger";

export type FeishuConnectionState =
  | "connected"
  | "not_configured"
  | "unavailable";

export type InternalStorageScope = "enterprise_shared" | "personal" | "unknown";

export type InternalStorageOverview = {
  connectionState: FeishuConnectionState;
  storageScope?: InternalStorageScope;
  driveRootName?: string | null;
  driveRootUrl?: string | null;
  indexName?: string | null;
  projectCount?: number | null;
  fileCount?: number | null;
  pendingCount?: number | null;
  failedCount?: number | null;
  lastSyncAt?: string | null;
};

export type InternalOperationItem = {
  id: string;
  operationType: OperationType;
  status: OperationStatus;
  projectName?: string | null;
  actorName?: string | null;
  occurredAt: string;
  summary?: string | null;
};

export const EMPTY_INTERNAL_STORAGE_OVERVIEW: InternalStorageOverview = {
  connectionState: "not_configured",
  storageScope: "unknown",
};
