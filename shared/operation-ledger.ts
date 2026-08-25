export const OPERATION_TYPES = [
  "import",
  "analysis",
  "feishu_sync",
  "feishu_inbox_pull",
  "project_archive",
  "project_restore",
  "external_share",
  "app_update",
  "product_feedback_sync",
  "system",
] as const;

export const OPERATION_STATUSES = [
  "started",
  "succeeded",
  "failed",
  "partial",
  "cancelled",
] as const;

export const OPERATION_ACTOR_KINDS = ["human", "codex", "system"] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];
export type OperationStatus = (typeof OPERATION_STATUSES)[number];
export type OperationActorKind = (typeof OPERATION_ACTOR_KINDS)[number];

export type OperationMetadataValue =
  | string
  | number
  | boolean
  | null
  | OperationMetadataValue[]
  | { [key: string]: OperationMetadataValue };

export type OperationMetadata = Record<string, OperationMetadataValue>;

export type OperationActor = {
  kind: OperationActorKind;
  id: string;
  name?: string | null;
};

export type OperationError = {
  code: string;
  message: string;
};

export type OperationEvent = {
  id: number;
  operationId: string;
  operationType: OperationType;
  status: OperationStatus;
  occurredAt: string;
  startedAt: string;
  finishedAt: string | null;
  projectId: string | null;
  fileHash: string | null;
  appVersion: string;
  actor: OperationActor;
  skill: {
    name: string;
    version: string | null;
  } | null;
  model: string | null;
  promptVersion: string | null;
  error: OperationError | null;
  metadata: OperationMetadata;
};

export type OperationSummary = OperationEvent & {
  eventCount: number;
};

export type OperationListFilters = {
  operationType?: OperationType;
  status?: OperationStatus;
  projectId?: string;
  beforeId?: number;
  limit?: number;
};
