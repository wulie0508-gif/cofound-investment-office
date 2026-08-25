import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collaborationAuth } from "../collaboration/auth";
import {
  CUSTOM_FIELD_TYPES,
  MANAGEMENT_DECISIONS,
  SHARE_MODES,
} from "../../shared/bp";
import {
  OPERATION_STATUSES,
  OPERATION_TYPES,
} from "../../shared/operation-ledger";
import {
  iterationClaimInputSchema,
  iterationCompleteInputSchema,
  iterationCreateInputSchema,
  iterationDecisionInputSchema,
  iterationFinalizeInputSchema,
  iterationHeartbeatInputSchema,
  iterationIdInputSchema,
  iterationListInputSchema,
  iterationNeedsAttentionInputSchema,
  iterationPreflightFinalizeInputSchema,
  iterationProgressInputSchema,
  iterationRequeueInputSchema,
} from "../../shared/iteration";
import {
  productFeedbackClaimInputSchema,
  productFeedbackCloseMaintenanceRequestSchema,
  productFeedbackCompleteInputSchema,
  productFeedbackHeartbeatInputSchema,
  productFeedbackIdInputSchema,
  productFeedbackIngestRemoteInputSchema,
  productFeedbackListInputSchema,
  productFeedbackMarkFailedInputSchema,
  productFeedbackMarkSyncedInputSchema,
  productFeedbackNeedsAttentionInputSchema,
  productFeedbackPendingOutboxInputSchema,
  productFeedbackProgressInputSchema,
  productFeedbackSubmitInputSchema,
  productFeedbackTriageRequestSchema,
} from "../../shared/product-feedback";
import { getDatabase } from "./database";
import {
  claimCodexAnalysisTaskSchema,
  completeCodexAnalysisTaskSchema,
  completeCodexAnalysisSchema,
  createCodexAnalysisTaskSchema,
  failCodexAnalysisTaskSchema,
  listCodexAnalysisTasksSchema,
  prepareCodexAnalysisSchema,
  progressCodexAnalysisTaskSchema,
} from "./codex-analysis-schema";
import {
  completeCodexAnalysis,
  prepareCodexAnalysis,
} from "./codex-analysis-service";
import {
  claimCodexAnalysisTask,
  completeCodexAnalysisTask,
  createCodexAnalysisTask,
  failCodexAnalysisTask,
  progressCodexAnalysisTask,
} from "./codex-analysis-task-service";
import { openCodexProjectWorkspace } from "./codex-workspace-service";
import { reanalyzeProject, scanDirectory } from "./importer";
import { getOperationLedger } from "./operation-ledger";
import {
  getIterationService,
  IterationServiceError,
} from "./iteration-service";
import {
  getProductFeedbackService,
  ProductFeedbackServiceError,
} from "./product-feedback-service";
import {
  refreshMaintenanceInbox,
  refreshReporterMaintenanceUpdates,
  syncPendingFeedback,
} from "./feishu-feedback-service";
import {
  executeProjectFeishuSync,
  getInternalStorageStatus,
  planProjectFeishuSync,
} from "./feishu-sync-service";
import { planFeishuInboxPull, pullFeishuInbox } from "./feishu-inbox-service";
import {
  archiveLocalProject,
  restoreLocalProject,
} from "./project-lifecycle-service";
import { createCallerFactory, localProcedure, router } from "./trpc";
import {
  getWechatBpInbox,
  getWechatInboxJob,
  startWechatInboxScan,
} from "./wechat-inbox";

const filtersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  industries: z.array(z.string().max(100)).max(20).optional(),
  rounds: z.array(z.string().max(40)).max(10).optional(),
  statuses: z.array(z.enum(MANAGEMENT_DECISIONS)).max(20).optional(),
  importedAfter: z.string().datetime().optional(),
  importedBefore: z.string().datetime().optional(),
  traction: z.enum(["orders", "revenue", "loi"]).optional(),
});

const projectIdSchema = z.object({ id: z.string().min(3).max(80) });

const iterationProcedure = localProcedure.use(({ next }) => {
  if (process.env.COF_BP_MODE === "shared")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "共享部署不开放本地迭代任务接口",
    });
  return next();
});

const productFeedbackProcedure = localProcedure.use(({ next }) => {
  if (process.env.COF_BP_MODE === "shared")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "共享部署不开放本地产品反馈接口",
    });
  return next();
});

function runIteration<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof IterationServiceError)) throw error;
    const code =
      error.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "CONFLICT" || error.code === "LEASE_EXPIRED"
          ? "CONFLICT"
          : error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
}

function runProductFeedback<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof ProductFeedbackServiceError)) throw error;
    const code =
      error.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "CONFLICT" || error.code === "LEASE_EXPIRED"
          ? "CONFLICT"
          : error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
}

function localHumanName(
  request: Parameters<typeof collaborationAuth.getSession>[0]
) {
  return (
    collaborationAuth.getSession(request)?.name.trim() ||
    collaborationAuth.ensureLocalAdmin().name.trim() ||
    "本机使用者"
  );
}

export const appRouter = router({
  system: router({
    health: localProcedure.query(() => ({
      ok: true,
      mode: "local_only" as const,
      database: "sqlite" as const,
      uploadEnabled: false,
    })),
  }),
  operations: router({
    list: localProcedure
      .input(
        z
          .object({
            operationType: z.enum(OPERATION_TYPES).optional(),
            status: z.enum(OPERATION_STATUSES).optional(),
            projectId: z.string().trim().min(3).max(160).optional(),
            beforeId: z.number().int().positive().optional(),
            limit: z.number().int().min(1).max(200).default(50),
          })
          .optional()
      )
      .query(({ input }) => getOperationLedger().listOperations(input ?? {})),
    get: localProcedure
      .input(z.object({ operationId: z.string().trim().min(3).max(120) }))
      .query(({ input }) =>
        getOperationLedger().getOperation(input.operationId)
      ),
  }),
  iterations: router({
    overview: iterationProcedure
      .input(iterationListInputSchema.optional())
      .query(({ input }) =>
        runIteration(() => getIterationService().overview(input ?? {}))
      ),
    get: iterationProcedure
      .input(iterationIdInputSchema)
      .query(({ input }) =>
        runIteration(() => getIterationService().get(input.id))
      ),
    create: iterationProcedure
      .input(iterationCreateInputSchema)
      .mutation(({ input, ctx }) =>
        runIteration(() =>
          getIterationService().create({
            ...input,
            requestedBy: localHumanName(ctx.req),
          })
        )
      ),
    claim: iterationProcedure
      .input(iterationClaimInputSchema)
      .mutation(({ input }) =>
        runIteration(() => getIterationService().claim(input))
      ),
    update: iterationProcedure
      .input(iterationProgressInputSchema)
      .mutation(({ input }) =>
        runIteration(() => getIterationService().update(input))
      ),
    heartbeat: iterationProcedure
      .input(iterationHeartbeatInputSchema)
      .mutation(({ input }) =>
        runIteration(() => getIterationService().heartbeat(input))
      ),
    requeueExpired: iterationProcedure
      .input(iterationRequeueInputSchema)
      .mutation(({ input, ctx }) =>
        runIteration(() =>
          getIterationService().requeueExpired({
            ...input,
            requestedBy: localHumanName(ctx.req),
          })
        )
      ),
    needsAttention: iterationProcedure
      .input(iterationNeedsAttentionInputSchema)
      .mutation(({ input }) =>
        runIteration(() => getIterationService().needsAttention(input))
      ),
    complete: iterationProcedure
      .input(iterationCompleteInputSchema)
      .mutation(({ input }) =>
        runIteration(() => getIterationService().complete(input))
      ),
    decide: iterationProcedure
      .input(iterationDecisionInputSchema)
      .mutation(({ input, ctx }) =>
        runIteration(() =>
          getIterationService().decide({
            ...input,
            decidedBy: localHumanName(ctx.req),
          })
        )
      ),
    preflightFinalize: iterationProcedure
      .input(iterationPreflightFinalizeInputSchema)
      .mutation(({ input }) =>
        runIteration(() => getIterationService().preflightFinalize(input))
      ),
    finalize: iterationProcedure
      .input(iterationFinalizeInputSchema)
      .mutation(({ input }) =>
        runIteration(() => getIterationService().finalize(input))
      ),
    openCodex: iterationProcedure.mutation(() =>
      runIteration(() => getIterationService().openCodex())
    ),
  }),
  productFeedback: router({
    capabilities: productFeedbackProcedure.query(() =>
      runProductFeedback(() => getProductFeedbackService().capabilities())
    ),
    list: productFeedbackProcedure
      .input(productFeedbackListInputSchema.optional())
      .query(({ input }) =>
        runProductFeedback(() => getProductFeedbackService().list(input ?? {}))
      ),
    get: productFeedbackProcedure
      .input(productFeedbackIdInputSchema)
      .query(({ input }) =>
        runProductFeedback(() => getProductFeedbackService().get(input.id))
      ),
    create: productFeedbackProcedure
      .input(productFeedbackSubmitInputSchema)
      .mutation(({ input, ctx }) =>
        runProductFeedback(() =>
          getProductFeedbackService().create({
            ...input,
            reporterName: localHumanName(ctx.req),
          })
        )
      ),
    claim: productFeedbackProcedure
      .input(productFeedbackClaimInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() => getProductFeedbackService().claim(input))
      ),
    update: productFeedbackProcedure
      .input(productFeedbackProgressInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() => getProductFeedbackService().update(input))
      ),
    heartbeat: productFeedbackProcedure
      .input(productFeedbackHeartbeatInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() => getProductFeedbackService().heartbeat(input))
      ),
    needsAttention: productFeedbackProcedure
      .input(productFeedbackNeedsAttentionInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() =>
          getProductFeedbackService().needsAttention(input)
        )
      ),
    complete: productFeedbackProcedure
      .input(productFeedbackCompleteInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() => getProductFeedbackService().complete(input))
      ),
    pendingOutbox: productFeedbackProcedure
      .input(productFeedbackPendingOutboxInputSchema.optional())
      .query(({ input }) =>
        runProductFeedback(() =>
          getProductFeedbackService().pendingOutbox(input ?? {})
        )
      ),
    markOutboxSynced: productFeedbackProcedure
      .input(productFeedbackMarkSyncedInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() =>
          getProductFeedbackService().markOutboxSynced(input)
        )
      ),
    markOutboxFailed: productFeedbackProcedure
      .input(productFeedbackMarkFailedInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() =>
          getProductFeedbackService().markOutboxFailed(input)
        )
      ),
    ingestRemote: productFeedbackProcedure
      .input(productFeedbackIngestRemoteInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() =>
          getProductFeedbackService().ingestRemote(input)
        )
      ),
    applyMaintenanceUpdate: productFeedbackProcedure
      .input(productFeedbackIngestRemoteInputSchema)
      .mutation(({ input }) =>
        runProductFeedback(() =>
          getProductFeedbackService().applyRemoteMaintenanceUpdate(input)
        )
      ),
    triage: productFeedbackProcedure
      .input(productFeedbackTriageRequestSchema)
      .mutation(({ input, ctx }) =>
        runProductFeedback(() =>
          getProductFeedbackService().triage({
            ...input,
            decidedBy: localHumanName(ctx.req),
          })
        )
      ),
    closeMaintenance: productFeedbackProcedure
      .input(productFeedbackCloseMaintenanceRequestSchema)
      .mutation(({ input, ctx }) =>
        runProductFeedback(() =>
          getProductFeedbackService().closeMaintenance({
            ...input,
            decidedBy: localHumanName(ctx.req),
          })
        )
      ),
    sync: productFeedbackProcedure
      .input(productFeedbackIdInputSchema)
      .mutation(({ input }) =>
        syncPendingFeedback(undefined, { feedbackId: input.id })
      ),
    refreshMaintainerInbox: productFeedbackProcedure.mutation(() => {
      if (!getProductFeedbackService().capabilities().maintainerMode)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "当前安装不是产品维护端",
        });
      return refreshMaintenanceInbox();
    }),
    refreshInbox: productFeedbackProcedure.mutation(() => {
      if (!getProductFeedbackService().capabilities().maintainerMode)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "当前安装不是产品维护端",
        });
      return refreshMaintenanceInbox();
    }),
    refreshStatus: productFeedbackProcedure.mutation(() =>
      refreshReporterMaintenanceUpdates()
    ),
  }),
  internalStorage: router({
    status: localProcedure.query(() => getInternalStorageStatus()),
    planInbox: localProcedure.mutation(() => planFeishuInboxPull()),
    pullInbox: localProcedure.mutation(({ ctx }) =>
      pullFeishuInbox({ requestedBy: localHumanName(ctx.req) })
    ),
    plan: localProcedure
      .input(
        z.object({
          projectId: z.string().trim().min(3).max(160),
          requestedBy: z.string().trim().min(1).max(120),
        })
      )
      .mutation(({ input }) =>
        planProjectFeishuSync(input.projectId, input.requestedBy)
      ),
    sync: localProcedure
      .input(
        z.object({
          projectId: z.string().trim().min(3).max(160),
          requestedBy: z.string().trim().min(1).max(120),
          planId: z.string().trim().min(8).max(120),
          confirmed: z.literal(true),
        })
      )
      .mutation(({ input }) => executeProjectFeishuSync(input)),
  }),
  projects: router({
    recycleBin: localProcedure.query(() =>
      getDatabase().listArchivedProjects()
    ),
    list: localProcedure.input(filtersSchema.optional()).query(({ input }) => {
      const database = getDatabase();
      const items = database.listProjects(input ?? {});
      const all = database.listProjects();
      return {
        items,
        options: database.filterOptions(),
        stats: {
          total: all.length,
          active: all.filter(project =>
            [
              "继续了解",
              "补充材料",
              "安排沟通",
              "进入尽调",
              "持续跟踪",
            ].includes(project.managementStatus)
          ).length,
          pendingDecision: all.filter(
            project => project.managementStatus === "待判断"
          ).length,
          dueDiligence: all.filter(
            project => project.managementStatus === "进入尽调"
          ).length,
          informationGaps: all.filter(
            project => project.aiStatus === "信息不足"
          ).length,
        },
      };
    }),
    get: localProcedure
      .input(projectIdSchema)
      .query(({ input }) => getDatabase().getActiveProject(input.id)),
    archive: localProcedure.input(projectIdSchema).mutation(({ input, ctx }) =>
      archiveLocalProject({
        projectId: input.id,
        requestedBy: localHumanName(ctx.req),
      })
    ),
    restore: localProcedure.input(projectIdSchema).mutation(({ input, ctx }) =>
      restoreLocalProject({
        projectId: input.id,
        requestedBy: localHumanName(ctx.req),
      })
    ),
    analyze: localProcedure
      .input(projectIdSchema)
      .mutation(({ input }) => reanalyzeProject(input.id)),
    scan: localProcedure
      .input(z.object({ directory: z.string().min(1).max(1024) }))
      .mutation(({ input }) => scanDirectory(input.directory)),
    updateStatus: localProcedure
      .input(
        z.object({
          id: z.string().min(3).max(80),
          status: z.enum(MANAGEMENT_DECISIONS),
          locked: z.boolean(),
          note: z.string().trim().max(500).optional(),
        })
      )
      .mutation(({ input }) => {
        getDatabase().updateManagementStatus(
          input.id,
          input.status,
          input.locked,
          input.note
        );
        return getDatabase().getProject(input.id);
      }),
    updateShareMode: localProcedure
      .input(
        z.object({
          id: z.string().min(3).max(80),
          shareMode: z.enum(SHARE_MODES),
        })
      )
      .mutation(({ input }) => {
        getDatabase().updateShareMode(input.id, input.shareMode);
        return getDatabase().getProject(input.id);
      }),
  }),
  codexAnalysis: router({
    prepare: localProcedure
      .input(prepareCodexAnalysisSchema)
      .mutation(({ input }) => prepareCodexAnalysis(input)),
    complete: localProcedure
      .input(completeCodexAnalysisSchema)
      .mutation(({ input }) => completeCodexAnalysis(input)),
    list: localProcedure
      .input(
        z.object({
          projectId: z.string().trim().min(3).max(80),
          limit: z.number().int().min(1).max(50).default(10),
        })
      )
      .query(({ input }) =>
        getDatabase().listCodexAnalysisRuns(input.projectId, input.limit)
      ),
  }),
  codexAnalysisTasks: router({
    create: localProcedure
      .input(createCodexAnalysisTaskSchema)
      .mutation(async ({ input }) => createCodexAnalysisTask(input)),
    list: localProcedure
      .input(listCodexAnalysisTasksSchema)
      .query(({ input }) =>
        getDatabase().listCodexAnalysisTasks(input.projectId, input.limit)
      ),
    current: localProcedure
      .input(z.object({ projectId: z.string().trim().min(3).max(80) }))
      .query(({ input }) =>
        getDatabase().getCurrentCodexAnalysisTask(input.projectId)
      ),
    claim: localProcedure
      .input(claimCodexAnalysisTaskSchema)
      .mutation(({ input }) => claimCodexAnalysisTask(input)),
    progress: localProcedure
      .input(progressCodexAnalysisTaskSchema)
      .mutation(({ input }) => progressCodexAnalysisTask(input)),
    complete: localProcedure
      .input(completeCodexAnalysisTaskSchema)
      .mutation(({ input }) => completeCodexAnalysisTask(input)),
    fail: localProcedure
      .input(failCodexAnalysisTaskSchema)
      .mutation(({ input }) => failCodexAnalysisTask(input)),
  }),
  codexWorkspace: router({
    openProject: localProcedure
      .input(
        z.object({
          projectId: z.string().trim().min(3).max(80),
          requestedBy: z.string().trim().min(1).max(120),
        })
      )
      .mutation(({ input }) => openCodexProjectWorkspace(input)),
  }),
  wechatInbox: router({
    status: localProcedure.query(() =>
      getWechatBpInbox().status(getWechatInboxJob())
    ),
    initialize: localProcedure.mutation(() => getWechatBpInbox().initialize()),
    scan: localProcedure.mutation(() => startWechatInboxScan()),
  }),
  materials: router({
    inbox: localProcedure.query(() => {
      const database = getDatabase();
      return {
        items: database.listPendingMaterials(),
        projects: database.listProjectIdentities(),
      };
    }),
    assign: localProcedure
      .input(
        z.object({
          materialId: z.string().min(3).max(100),
          projectId: z.string().min(3).max(100),
        })
      )
      .mutation(({ input }) => {
        getDatabase().assignMaterial(input.materialId, input.projectId);
        return { ok: true };
      }),
  }),
  customFields: router({
    list: localProcedure.query(() => getDatabase().listFieldDefinitions()),
    create: localProcedure
      .input(
        z.object({
          label: z.string().trim().min(1).max(40),
          fieldType: z.enum(CUSTOM_FIELD_TYPES),
          options: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
          showInList: z.boolean().optional(),
        })
      )
      .mutation(({ input }) => getDatabase().createFieldDefinition(input)),
    update: localProcedure
      .input(
        z.object({
          key: z.string().min(8).max(100),
          label: z.string().trim().min(1).max(40).optional(),
          options: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
          showInList: z.boolean().optional(),
          active: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(1_000).optional(),
        })
      )
      .mutation(({ input }) => {
        const { key, ...changes } = input;
        return getDatabase().updateFieldDefinition(key, changes);
      }),
    setValue: localProcedure
      .input(
        z.object({
          projectId: z.string().min(3).max(100),
          fieldKey: z.string().min(8).max(100),
          value: z.union([
            z.string().max(2_000),
            z.number(),
            z.boolean(),
            z.null(),
          ]),
        })
      )
      .mutation(({ input }) =>
        getDatabase().setCustomFieldValue(
          input.projectId,
          input.fieldKey,
          input.value
        )
      ),
  }),
});

export const createCaller = createCallerFactory(appRouter);
export type AppRouter = typeof appRouter;
