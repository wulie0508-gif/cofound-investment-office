import { z } from "zod";
import {
  ANALYSIS_STATUSES,
  CODEX_ANALYSIS_TASK_MODES,
  CODEX_INVESTMENT_ANALYSIS_SKILLS,
  type CodexInvestmentAnalysisResult,
} from "../../shared/bp";

const adaptiveBriefSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_200)
  .transform(value =>
    value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );

const evidenceRefSchema = z
  .object({
    fieldKey: z.string().trim().min(1).max(100).nullable(),
    page: z.number().int().positive().max(10_000).nullable(),
    quote: z.string().trim().min(1).max(1_200).nullable(),
  })
  .refine(
    value =>
      value.fieldKey !== null || value.page !== null || value.quote !== null,
    "证据引用至少需要字段、页码或短引文中的一项"
  );

const claimSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    detail: z.string().trim().min(1).max(3_000),
    basis: z.enum(["evidence", "inference", "missing_information"]),
    evidence: z.array(evidenceRefSchema).max(8),
  })
  .refine(value => value.basis !== "evidence" || value.evidence.length > 0, {
    message: "以证据为依据的判断必须包含至少一条证据引用",
    path: ["evidence"],
  });

const frameworkSectionSchema = z.object({
  key: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(180),
  assessment: z.enum(["supportive", "mixed", "concern", "unknown"]),
  detail: z.string().trim().min(1).max(3_000),
  evidence: z.array(evidenceRefSchema).max(12),
  counterarguments: z.array(z.string().trim().min(1).max(1_200)).max(8),
  unresolvedQuestions: z.array(z.string().trim().min(1).max(800)).max(8),
});

export const codexInvestmentAnalysisResultSchema: z.ZodType<CodexInvestmentAnalysisResult> =
  z.object({
    schemaVersion: z.literal("1.0"),
    summary: z.string().trim().min(1).max(4_000),
    positiveSignals: z.array(claimSchema).max(12),
    keyRisks: z.array(claimSchema).max(12),
    frameworkSections: z.array(frameworkSectionSchema).min(1).max(12),
    unresolvedQuestions: z.array(z.string().trim().min(1).max(800)).max(20),
    nextActions: z.array(z.string().trim().min(1).max(800)).max(12),
    aiSuggestion: z.enum(ANALYSIS_STATUSES),
    confidence: z.enum(["low", "medium", "high"]),
  });

export const prepareCodexAnalysisSchema = z.object({
  projectId: z.string().trim().min(3).max(80),
  skillName: z.enum(CODEX_INVESTMENT_ANALYSIS_SKILLS),
  requestedBy: z.string().trim().min(1).max(120),
  force: z.boolean().default(false),
  taskId: z.string().trim().min(3).max(100).optional(),
});

export const completeCodexAnalysisSchema = z.object({
  runId: z.string().trim().min(3).max(100),
  modelName: z.string().trim().min(1).max(160),
  result: codexInvestmentAnalysisResultSchema,
});

export const readPreparedCodexAnalysisPagesSchema = z.object({
  runId: z.string().trim().min(3).max(100),
  pageNumbers: z
    .array(z.number().int().positive().max(10_000))
    .min(1)
    .max(8)
    .transform(values => [...new Set(values)]),
});

export const createCodexAnalysisTaskSchema = z.object({
  projectId: z.string().trim().min(3).max(80),
  mode: z.enum(CODEX_ANALYSIS_TASK_MODES).default("auto"),
  requestedBy: z.string().trim().min(1).max(120),
  userPrompt: adaptiveBriefSchema.optional(),
});

export const listCodexAnalysisTasksSchema = z.object({
  projectId: z.string().trim().min(3).max(80),
  limit: z.number().int().min(1).max(50).default(10),
});

export const claimCodexAnalysisTaskSchema = z.object({
  taskId: z.string().trim().min(3).max(100).optional(),
  claimedBy: z.string().trim().min(1).max(120),
  leaseSeconds: z.number().int().min(60).max(3_600).default(1_800),
  codexThreadId: z.string().trim().min(1).max(200).optional(),
  codexTurnId: z.string().trim().min(1).max(200).optional(),
});

export const progressCodexAnalysisTaskSchema = z.object({
  taskId: z.string().trim().min(3).max(100),
  claimToken: z.string().trim().min(32).max(256),
  message: z.string().trim().min(1).max(500),
  selectedSkill: z.enum(CODEX_INVESTMENT_ANALYSIS_SKILLS).optional(),
  routerReason: z.string().trim().min(1).max(1_000).optional(),
  codexThreadId: z.string().trim().min(1).max(200).optional(),
  codexTurnId: z.string().trim().min(1).max(200).optional(),
  leaseSeconds: z.number().int().min(60).max(3_600).default(1_800),
});

export const completeCodexAnalysisTaskSchema = z.object({
  taskId: z.string().trim().min(3).max(100),
  claimToken: z.string().trim().min(32).max(256),
  runId: z.string().trim().min(3).max(100),
  selectedSkill: z.enum(CODEX_INVESTMENT_ANALYSIS_SKILLS),
  routerReason: z.string().trim().min(1).max(1_000),
  codexThreadId: z.string().trim().min(1).max(200).optional(),
  codexTurnId: z.string().trim().min(1).max(200).optional(),
});

export const failCodexAnalysisTaskSchema = z.object({
  taskId: z.string().trim().min(3).max(100),
  claimToken: z.string().trim().min(32).max(256),
  errorDetail: z.string().trim().min(1).max(2_000),
  codexThreadId: z.string().trim().min(1).max(200).optional(),
  codexTurnId: z.string().trim().min(1).max(200).optional(),
});
