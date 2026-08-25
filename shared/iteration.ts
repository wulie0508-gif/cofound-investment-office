import { z } from "zod";

export const ITERATION_CONTRACT_VERSION = "1.0" as const;
export const ITERATION_CAPABILITY_PACK_VERSION =
  "0.11.0+codex.20260824" as const;

export const ITERATION_CATEGORIES = [
  "interface",
  "analysis",
  "workflow",
  "sharing",
  "data",
  "other",
] as const;

export const ITERATION_QUALITIES = ["quick", "standard", "deep"] as const;

export const ITERATION_STATUSES = [
  "ready_for_codex",
  "working",
  "checking",
  "needs_attention",
  "ready",
  "approved",
  "completed",
  "paused",
] as const;

export const ITERATION_CHECK_STATUSES = [
  "passed",
  "warning",
  "failed",
] as const;

export const ITERATION_DECISIONS = ["accept", "revise", "pause"] as const;

export const ITERATION_EVENT_TYPES = [
  "created",
  "claimed",
  "progress_updated",
  "needs_attention",
  "result_submitted",
  "accepted",
  "revision_requested",
  "paused",
  "finalized",
] as const;

export type IterationCategory = (typeof ITERATION_CATEGORIES)[number];
export type IterationQuality = (typeof ITERATION_QUALITIES)[number];
export type IterationStatus = (typeof ITERATION_STATUSES)[number];
export type IterationDecision = (typeof ITERATION_DECISIONS)[number];
export type IterationEventType = (typeof ITERATION_EVENT_TYPES)[number];

const actorSchema = z.string().trim().min(1).max(120);
const taskIdSchema = z.string().trim().min(8).max(100);
const claimTokenSchema = z.string().trim().min(32).max(256);
const commitRefSchema = z
  .string()
  .trim()
  .regex(/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/u)
  .transform(value => value.toLowerCase());

const forbiddenVisibleResultPatterns = [
  /\b(?:git(?:hub|lab)?|commit|branch|worktree|sha(?:-?256)?)\b/iu,
  /\b(?:[a-f0-9]{40}|[a-f0-9]{64})\b/iu,
  /\b[A-Za-z]:[\\/][^\s]*/u,
  /(?:^|[^A-Za-z0-9_])(?:\.{0,2}[\\/])?(?:client|server|shared|scripts|plugins|src|dist|node_modules)[\\/][^\s]*/iu,
  /\/(?:Users|home|tmp|var|etc|workspace|app|src|client|server)\/[^\s]*/iu,
  /(?:^|[^A-Za-z0-9_])[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|map|sql)(?:\b|$)/iu,
  /https?:\/\/[^\s]+/iu,
  /\b(?:git|pnpm|npm|yarn|node|tsx|npx|powershell(?:\.exe)?|cmd(?:\.exe)?|bash|sh|curl|wget|rm|cp|mv|mkdir|cd)(?:\s|$)/iu,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Exception|Error):\s*[^\n\r]+/u,
  /(?:^|[\n\r])\s*at\s+[^\n\r]+\([^\n\r]+:\d+(?::\d+)?\)/u,
] as const;

function visibleResultText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .superRefine((value, context) => {
      if (forbiddenVisibleResultPatterns.some(pattern => pattern.test(value)))
        context.addIssue({
          code: "custom",
          message:
            "公开结果只能描述产品变化，不得包含技术定位、命令、路径或外部链接",
        });
    });
}

const safePreviewUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine(value => {
    if (
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.startsWith("/\\") &&
      !value.includes("\\")
    )
      return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        !url.username &&
        !url.password &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      );
    } catch {
      return false;
    }
  }, "previewUrl 只能是站内单斜杠路径或本机 HTTP 地址");

export const iterationResultSchema = z
  .object({
    summary: visibleResultText(4_000),
    changes: z.array(visibleResultText(1_000)).max(100),
    checks: z
      .array(
        z
          .object({
            label: visibleResultText(200),
            status: z.enum(ITERATION_CHECK_STATUSES),
            summary: visibleResultText(1_000),
          })
          .strict()
      )
      .max(100),
    risks: z.array(visibleResultText(1_000)).max(100),
    previewUrl: safePreviewUrlSchema.optional(),
  })
  .strict();

export const iterationCreateInputSchema = z
  .object({
    description: z.string().trim().min(1).max(8_000),
    category: z.enum(ITERATION_CATEGORIES),
    qualityMode: z.enum(ITERATION_QUALITIES),
    requestedBy: actorSchema,
  })
  .strict();

export const iterationListInputSchema = z
  .object({
    status: z.enum(ITERATION_STATUSES).optional(),
    category: z.enum(ITERATION_CATEGORIES).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const iterationIdInputSchema = z.object({ id: taskIdSchema }).strict();

export const iterationClaimInputSchema = z
  .object({
    id: taskIdSchema.optional(),
    claimedBy: actorSchema,
    modelName: z.string().trim().min(1).max(200),
  })
  .strict();

export const iterationProgressInputSchema = z
  .object({
    id: taskIdSchema,
    claimToken: claimTokenSchema,
    status: z.enum(["working", "checking"]),
    message: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const iterationNeedsAttentionInputSchema = z
  .object({
    id: taskIdSchema,
    claimToken: claimTokenSchema,
    message: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const iterationCompleteInputSchema = z
  .object({
    id: taskIdSchema,
    claimToken: claimTokenSchema,
    modelName: z.string().trim().min(1).max(200),
    candidateRef: commitRefSchema,
    result: iterationResultSchema,
  })
  .strict();

export const iterationDecisionInputSchema = z
  .object({
    id: taskIdSchema,
    action: z.enum(ITERATION_DECISIONS),
    decidedBy: actorSchema,
    note: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "revise" && !value.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "退回修改时必须填写反馈",
      });
    }
  });

export const iterationFinalizeInputSchema = z
  .object({
    id: taskIdSchema,
    appliedRef: commitRefSchema,
  })
  .strict();

export const iterationPreflightFinalizeInputSchema = z
  .object({
    id: taskIdSchema,
    candidateRef: commitRefSchema,
  })
  .strict();

export const iterationHeartbeatInputSchema = z
  .object({
    id: taskIdSchema,
    claimToken: claimTokenSchema,
  })
  .strict();

export const iterationRequeueInputSchema = z
  .object({
    id: taskIdSchema,
    requestedBy: actorSchema,
  })
  .strict();

export type IterationResult = z.infer<typeof iterationResultSchema>;
export type IterationCreateInput = z.infer<typeof iterationCreateInputSchema>;
export type IterationListInput = z.infer<typeof iterationListInputSchema>;
export type IterationClaimInput = z.infer<typeof iterationClaimInputSchema>;
export type IterationProgressInput = z.infer<
  typeof iterationProgressInputSchema
>;
export type IterationNeedsAttentionInput = z.infer<
  typeof iterationNeedsAttentionInputSchema
>;
export type IterationCompleteInput = z.infer<
  typeof iterationCompleteInputSchema
>;
export type IterationDecisionInput = z.infer<
  typeof iterationDecisionInputSchema
>;
export type IterationFinalizeInput = z.infer<
  typeof iterationFinalizeInputSchema
>;
export type IterationPreflightFinalizeInput = z.infer<
  typeof iterationPreflightFinalizeInputSchema
>;
export type IterationHeartbeatInput = z.infer<
  typeof iterationHeartbeatInputSchema
>;
export type IterationRequeueInput = z.infer<typeof iterationRequeueInputSchema>;

export type IterationTaskDto = {
  id: string;
  title: string;
  description: string;
  category: IterationCategory;
  qualityMode: IterationQuality;
  status: IterationStatus;
  currentRound: number;
  requestedBy: string;
  claimedBy: string | null;
  canRequeue: boolean;
  feedback: string | null;
  result: IterationResult | null;
  createdAt: string;
  updatedAt: string;
};

export type IterationEventDto = {
  id: number;
  type: IterationEventType;
  fromStatus: IterationStatus | null;
  toStatus: IterationStatus;
  actorKind: "human" | "codex" | "system";
  actorName: string;
  round: number;
  createdAt: string;
};

export type IterationTaskDetailDto = {
  task: IterationTaskDto;
  events: IterationEventDto[];
};

export type IterationClaimResult = {
  task: IterationTaskDto;
  claimToken: string;
  leaseExpiresAt: string;
};

export type IterationHeartbeatResult = {
  ok: true;
  leaseExpiresAt: string;
};

export type IterationOverviewDto = {
  version: {
    appVersion: string;
    capabilityPackVersion: typeof ITERATION_CAPABILITY_PACK_VERSION;
    codexLaunchAvailable: boolean;
    directRunMode: "task_queue";
  };
  items: IterationTaskDto[];
};
