import { z } from "zod";
import { ITERATION_CATEGORIES, ITERATION_CHECK_STATUSES } from "./iteration";

export const PRODUCT_FEEDBACK_CONTRACT_VERSION = "1.0" as const;

export const PRODUCT_FEEDBACK_IMPACTS = [
  "minor",
  "inconvenient",
  "blocked",
] as const;

export const PRODUCT_FEEDBACK_DIAGNOSIS_STATUSES = [
  "awaiting_diagnosis",
  "ready_for_codex",
  "working",
  "checking",
  "needs_attention",
  "ready",
] as const;

export const PRODUCT_FEEDBACK_TRIAL_STATUSES = [
  "not_attempted",
  "not_available",
  "passed",
  "failed",
] as const;

export const PRODUCT_FEEDBACK_SYNC_STATUSES = [
  "pending",
  "synced",
  "failed",
] as const;

export const PRODUCT_FEEDBACK_TRIAGE_STATUSES = [
  "new",
  "needs_info",
  "duplicate",
  "deferred",
  "accepted",
  "completed",
] as const;

export const PRODUCT_FEEDBACK_SOURCES = ["local", "remote"] as const;

export const PRODUCT_FEEDBACK_EVENT_TYPES = [
  "created",
  "claimed",
  "progress_updated",
  "needs_attention",
  "diagnosis_completed",
  "outbox_synced",
  "outbox_failed",
  "remote_ingested",
  "triage_changed",
  "iteration_created",
  "maintenance_completed",
] as const;

export const PRODUCT_FEEDBACK_OUTBOX_KINDS = [
  "initial_submission",
  "diagnosis_update",
  "maintenance_update",
] as const;

export const PRODUCT_FEEDBACK_OUTBOX_STATUSES = [
  "pending",
  "synced",
  "failed",
] as const;

export const PRODUCT_FEEDBACK_TRIAGE_ACTIONS = [
  "needs_info",
  "duplicate",
  "deferred",
  "accept",
] as const;

export type ProductFeedbackImpact = (typeof PRODUCT_FEEDBACK_IMPACTS)[number];
export type ProductFeedbackDiagnosisStatus =
  (typeof PRODUCT_FEEDBACK_DIAGNOSIS_STATUSES)[number];
export type ProductFeedbackTrialStatus =
  (typeof PRODUCT_FEEDBACK_TRIAL_STATUSES)[number];
export type ProductFeedbackSyncStatus =
  (typeof PRODUCT_FEEDBACK_SYNC_STATUSES)[number];
export type ProductFeedbackTriageStatus =
  (typeof PRODUCT_FEEDBACK_TRIAGE_STATUSES)[number];
export type ProductFeedbackSource = (typeof PRODUCT_FEEDBACK_SOURCES)[number];
export type ProductFeedbackEventType =
  (typeof PRODUCT_FEEDBACK_EVENT_TYPES)[number];
export type ProductFeedbackOutboxKind =
  (typeof PRODUCT_FEEDBACK_OUTBOX_KINDS)[number];

const identifierSchema = z
  .string()
  .trim()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/u, "标识格式无效");
const claimTokenSchema = z.string().trim().min(32).max(256);
const versionSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u, "版本号格式无效");

const forbiddenFeedbackPatterns = [
  /\b(?:git(?:hub|lab)?|commit|branch|worktree|sha(?:-?256)?)\b/iu,
  /\b(?:[a-f0-9]{40}|[a-f0-9]{64})\b/iu,
  /\b[A-Za-z]:[\\/][^\s]*/u,
  /(?:^|[^A-Za-z0-9_])(?:\.{0,2}[\\/])?(?:client|server|shared|scripts|plugins|src|dist|node_modules)[\\/][^\s]*/iu,
  /\/(?:Users|home|tmp|var|etc|workspace|app|src|client|server)\/[^\s]*/iu,
  /(?:^|[^A-Za-z0-9_])[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|map|sql)(?:\b|$)/iu,
  /https?:\/\/[^\s]+/iu,
  /\b(?:git|pnpm|npm|yarn|node|tsx|npx|powershell(?:\.exe)?|cmd(?:\.exe)?|bash|sh|curl|wget|rm|cp|mv|mkdir|cd)(?:\s|$)/iu,
  /\b(?:access[_-]?token|refresh[_-]?token|token|password|passcode|secret|otp|authorization|cookie)\b/iu,
  /(?:验证码|校验码|密码|密钥|访问码)\s*[:：=]\s*\S+/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /(?:^|[\n\r])\s*(?:BP|商业计划书)\s*(?:正文|全文|原文|全部内容)\s*[:：]/iu,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Exception|Error):\s*[^\n\r]+/u,
  /(?:^|[\n\r])\s*at\s+[^\n\r]+\([^\n\r]+:\d+(?::\d+)?\)/u,
] as const;

const forbiddenActorPatterns = [
  /\b(?:[a-f0-9]{40}|[a-f0-9]{64})\b/iu,
  /\b[A-Za-z]:[\\/][^\s]*/u,
  /https?:\/\/[^\s]+/iu,
  /\b(?:access[_-]?token|refresh[_-]?token|token|password|passcode|secret|otp|authorization|cookie)\b/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
] as const;

const actorSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .superRefine((value, context) => {
    if (forbiddenActorPatterns.some(pattern => pattern.test(value)))
      context.addIssue({ code: "custom", message: "身份名称包含不安全内容" });
  });

export function safeProductFeedbackText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .superRefine((value, context) => {
      if (forbiddenFeedbackPatterns.some(pattern => pattern.test(value)))
        context.addIssue({
          code: "custom",
          message: "反馈内容不得包含源码定位、命令、凭据、外部链接或 BP 正文",
        });
    });
}

export const productFeedbackDiagnosisSchema = z
  .object({
    summary: safeProductFeedbackText(4_000),
    proposedActions: z.array(safeProductFeedbackText(1_000)).max(50),
    checks: z
      .array(
        z
          .object({
            label: safeProductFeedbackText(200),
            status: z.enum(ITERATION_CHECK_STATUSES),
            summary: safeProductFeedbackText(1_000),
          })
          .strict()
      )
      .max(50),
    risks: z.array(safeProductFeedbackText(1_000)).max(50),
    openQuestions: z.array(safeProductFeedbackText(1_000)).max(50),
  })
  .strict();

export const productFeedbackCreateInputSchema = z
  .object({
    description: safeProductFeedbackText(4_000),
    expectedOutcome: safeProductFeedbackText(2_000).optional(),
    category: z.enum(ITERATION_CATEGORIES),
    impact: z.enum(PRODUCT_FEEDBACK_IMPACTS),
    reporterName: actorSchema,
  })
  .strict();

export const productFeedbackSubmitInputSchema = productFeedbackCreateInputSchema
  .omit({ reporterName: true })
  .strict();

export const productFeedbackListInputSchema = z
  .object({
    status: z.enum(PRODUCT_FEEDBACK_DIAGNOSIS_STATUSES).optional(),
    syncStatus: z.enum(PRODUCT_FEEDBACK_SYNC_STATUSES).optional(),
    triageStatus: z.enum(PRODUCT_FEEDBACK_TRIAGE_STATUSES).optional(),
    source: z.enum(PRODUCT_FEEDBACK_SOURCES).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const productFeedbackIdInputSchema = z
  .object({ id: identifierSchema })
  .strict();

export const productFeedbackClaimInputSchema = z
  .object({
    id: identifierSchema.optional(),
    claimedBy: actorSchema,
    modelName: z.string().trim().min(1).max(200),
  })
  .strict();

export const productFeedbackProgressInputSchema = z
  .object({
    id: identifierSchema,
    claimToken: claimTokenSchema,
    status: z.enum(["working", "checking"]),
    message: safeProductFeedbackText(1_000).optional(),
  })
  .strict();

export const productFeedbackHeartbeatInputSchema = z
  .object({
    id: identifierSchema,
    claimToken: claimTokenSchema,
  })
  .strict();

export const productFeedbackNeedsAttentionInputSchema = z
  .object({
    id: identifierSchema,
    claimToken: claimTokenSchema,
    message: safeProductFeedbackText(1_000),
  })
  .strict();

export const productFeedbackCompleteInputSchema = z
  .object({
    id: identifierSchema,
    claimToken: claimTokenSchema,
    modelName: z.string().trim().min(1).max(200),
    diagnosis: productFeedbackDiagnosisSchema,
    trialFixStatus: z.enum(PRODUCT_FEEDBACK_TRIAL_STATUSES),
  })
  .strict();

export const productFeedbackTriageInputSchema = z
  .object({
    id: identifierSchema,
    action: z.enum(PRODUCT_FEEDBACK_TRIAGE_ACTIONS),
    decidedBy: actorSchema,
    note: safeProductFeedbackText(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action !== "accept" && !value.note)
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "该维护判断必须填写说明",
      });
  });

export const productFeedbackTriageRequestSchema = z
  .object({
    id: identifierSchema,
    action: z.enum(PRODUCT_FEEDBACK_TRIAGE_ACTIONS),
    note: safeProductFeedbackText(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action !== "accept" && !value.note)
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "该维护判断必须填写说明",
      });
  });

export const productFeedbackCloseMaintenanceInputSchema = z
  .object({
    id: identifierSchema,
    decidedBy: actorSchema,
    note: safeProductFeedbackText(2_000).optional(),
  })
  .strict();

export const productFeedbackCloseMaintenanceRequestSchema =
  productFeedbackCloseMaintenanceInputSchema.omit({ decidedBy: true }).strict();

export const productFeedbackOutboxIdInputSchema = z
  .object({ outboxId: identifierSchema })
  .strict();

export const productFeedbackMarkSyncedInputSchema = z
  .object({
    outboxId: identifierSchema,
    remoteRecordId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const productFeedbackMarkFailedInputSchema = z
  .object({
    outboxId: identifierSchema,
    error: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const productFeedbackPendingOutboxInputSchema = z
  .object({
    feedbackId: identifierSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const productFeedbackHandoffPayloadSchema = z
  .object({
    schemaVersion: z.literal(PRODUCT_FEEDBACK_CONTRACT_VERSION),
    applicationVersion: versionSchema,
    capabilityPackVersion: versionSchema,
    kind: z.enum(PRODUCT_FEEDBACK_OUTBOX_KINDS),
    outboxId: identifierSchema,
    sequence: z.number().int().positive(),
    originKey: identifierSchema,
    feedbackId: identifierSchema,
    round: z.number().int().positive(),
    reporterName: actorSchema,
    title: safeProductFeedbackText(160),
    description: safeProductFeedbackText(4_000),
    expectedOutcome: safeProductFeedbackText(2_000).nullable(),
    category: z.enum(ITERATION_CATEGORIES),
    impact: z.enum(PRODUCT_FEEDBACK_IMPACTS),
    submittedAt: z.string().datetime(),
    sourceUpdatedAt: z.string().datetime(),
    diagnosis: productFeedbackDiagnosisSchema.nullable(),
    trialFixStatus: z.enum(PRODUCT_FEEDBACK_TRIAL_STATUSES),
    triageStatus: z.enum(PRODUCT_FEEDBACK_TRIAGE_STATUSES).nullable(),
    maintainerNote: safeProductFeedbackText(2_000).nullable(),
    maintenanceTaskId: identifierSchema.nullable(),
    maintainerName: actorSchema.nullable(),
    maintenanceUpdatedAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "initial_submission" && value.diagnosis !== null)
      context.addIssue({
        code: "custom",
        path: ["diagnosis"],
        message: "首次提交不得伪装成诊断更新",
      });
    if (value.kind === "diagnosis_update" && value.diagnosis === null)
      context.addIssue({
        code: "custom",
        path: ["diagnosis"],
        message: "诊断更新必须包含诊断结果",
      });
    if (
      value.kind !== "maintenance_update" &&
      (value.triageStatus !== null ||
        value.maintainerNote !== null ||
        value.maintenanceTaskId !== null ||
        value.maintainerName !== null ||
        value.maintenanceUpdatedAt !== null)
    )
      context.addIssue({
        code: "custom",
        path: ["triageStatus"],
        message: "诊断提交不得伪装成维护更新",
      });
    if (value.kind === "maintenance_update" && value.triageStatus === null)
      context.addIssue({
        code: "custom",
        path: ["triageStatus"],
        message: "维护更新必须包含维护状态",
      });
    if (
      value.kind === "maintenance_update" &&
      (value.maintainerName === null || value.maintenanceUpdatedAt === null)
    )
      context.addIssue({
        code: "custom",
        path: ["maintainerName"],
        message: "维护更新必须标明维护者与更新时间",
      });
    if (
      value.kind === "maintenance_update" &&
      (value.triageStatus === "accepted" ||
        value.triageStatus === "completed") &&
      value.maintenanceTaskId === null
    )
      context.addIssue({
        code: "custom",
        path: ["maintenanceTaskId"],
        message: "已受理反馈必须关联维护任务",
      });
    if (
      value.kind === "maintenance_update" &&
      value.triageStatus !== "accepted" &&
      value.triageStatus !== "completed" &&
      value.maintenanceTaskId !== null
    )
      context.addIssue({
        code: "custom",
        path: ["maintenanceTaskId"],
        message: "未受理反馈不得关联维护任务",
      });
  });

export const productFeedbackIngestRemoteInputSchema = z
  .object({
    payload: productFeedbackHandoffPayloadSchema,
    remoteRecordId: z.string().trim().min(1).max(200),
  })
  .strict();

export type ProductFeedbackDiagnosis = z.infer<
  typeof productFeedbackDiagnosisSchema
>;
export type ProductFeedbackCreateInput = z.infer<
  typeof productFeedbackCreateInputSchema
>;
export type ProductFeedbackListInput = z.infer<
  typeof productFeedbackListInputSchema
>;
export type ProductFeedbackClaimInput = z.infer<
  typeof productFeedbackClaimInputSchema
>;
export type ProductFeedbackProgressInput = z.infer<
  typeof productFeedbackProgressInputSchema
>;
export type ProductFeedbackHeartbeatInput = z.infer<
  typeof productFeedbackHeartbeatInputSchema
>;
export type ProductFeedbackNeedsAttentionInput = z.infer<
  typeof productFeedbackNeedsAttentionInputSchema
>;
export type ProductFeedbackCompleteInput = z.infer<
  typeof productFeedbackCompleteInputSchema
>;
export type ProductFeedbackTriageInput = z.infer<
  typeof productFeedbackTriageInputSchema
>;
export type ProductFeedbackCloseMaintenanceInput = z.infer<
  typeof productFeedbackCloseMaintenanceInputSchema
>;
export type ProductFeedbackMarkSyncedInput = z.infer<
  typeof productFeedbackMarkSyncedInputSchema
>;
export type ProductFeedbackMarkFailedInput = z.infer<
  typeof productFeedbackMarkFailedInputSchema
>;
export type ProductFeedbackPendingOutboxInput = z.infer<
  typeof productFeedbackPendingOutboxInputSchema
>;
export type ProductFeedbackHandoffPayload = z.infer<
  typeof productFeedbackHandoffPayloadSchema
>;
export type ProductFeedbackIngestRemoteInput = z.infer<
  typeof productFeedbackIngestRemoteInputSchema
>;

export type ProductFeedbackDto = {
  id: string;
  title: string;
  description: string;
  expectedOutcome: string | null;
  category: (typeof ITERATION_CATEGORIES)[number];
  impact: ProductFeedbackImpact;
  source: ProductFeedbackSource;
  status: ProductFeedbackDiagnosisStatus;
  currentRound: number;
  reporterName: string;
  claimedBy: string | null;
  syncStatus: ProductFeedbackSyncStatus;
  triageStatus: ProductFeedbackTriageStatus;
  diagnosis: ProductFeedbackDiagnosis | null;
  trialFixStatus: ProductFeedbackTrialStatus;
  hasMaintenanceTask: boolean;
  maintainerNote: string | null;
  triagedBy: string | null;
  triagedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductFeedbackEventDto = {
  id: number;
  type: ProductFeedbackEventType;
  actorKind: "human" | "codex" | "system";
  actorName: string;
  createdAt: string;
};

export type ProductFeedbackDetailDto = {
  feedback: ProductFeedbackDto;
  events: ProductFeedbackEventDto[];
};

export type ProductFeedbackClaimResult = {
  feedback: ProductFeedbackDto;
  claimToken: string;
  leaseExpiresAt: string;
};

export type ProductFeedbackOutboxDto = {
  id: string;
  feedbackId: string;
  kind: ProductFeedbackOutboxKind;
  sequence: number;
  payload: ProductFeedbackHandoffPayload;
  status: (typeof PRODUCT_FEEDBACK_OUTBOX_STATUSES)[number];
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductFeedbackCapabilities = {
  maintainerMode: boolean;
};
