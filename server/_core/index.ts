import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { config } from "dotenv";
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import multer from "multer";
import { appRouter } from "../routers";
import { getDatabase } from "../local/database";
import { extractDocument, SUPPORTED_EXTENSIONS } from "../local/extractor";
import {
  importDocument,
  importFilePath,
  reanalyzeProject,
  scanDirectory,
} from "../local/importer";
import { createLocalContext } from "../local/trpc";
import { setupVite } from "./vite";
import {
  CUSTOM_FIELD_TYPES,
  MANAGEMENT_DECISIONS,
  MATERIAL_CATEGORIES,
  type CustomFieldType,
  type ManagementDecision,
  type MaterialCategory,
} from "../../shared/bp";
import {
  OPERATION_STATUSES,
  OPERATION_TYPES,
} from "../../shared/operation-ledger";
import {
  iterationClaimInputSchema,
  iterationCompleteInputSchema,
  iterationFinalizeInputSchema,
  iterationHeartbeatInputSchema,
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
import {
  collaborationErrorHandler,
  registerCollaborationRoutes,
} from "../collaboration/routes";
import {
  startCollaborationWorker,
  stopCollaborationWorker,
} from "../collaboration/worker";
import { collaborationAuth } from "../collaboration/auth";
import { importAnyFilePath } from "../local/material-importer";
import {
  claimCodexAnalysisTaskSchema,
  completeCodexAnalysisTaskSchema,
  completeCodexAnalysisSchema,
  createCodexAnalysisTaskSchema,
  failCodexAnalysisTaskSchema,
  progressCodexAnalysisTaskSchema,
  prepareCodexAnalysisSchema,
  readPreparedCodexAnalysisPagesSchema,
} from "../local/codex-analysis-schema";
import {
  completeCodexAnalysis,
  prepareCodexAnalysis,
} from "../local/codex-analysis-service";
import {
  claimCodexAnalysisTask,
  completeCodexAnalysisTask,
  createCodexAnalysisTask,
  failCodexAnalysisTask,
  progressCodexAnalysisTask,
} from "../local/codex-analysis-task-service";
import {
  getCleanTechEnhancementStatus,
  runCleanTechFinancialEvidenceAudit,
  runCleanTechPolicyMatch,
  runCleanTechProjectOpportunityMatch,
} from "../local/cleantech-runtime";
import { z } from "zod";
import {
  getWechatBpInbox,
  getWechatInboxJob,
  startWechatInboxScan,
} from "../local/wechat-inbox";
import { getOperationLedger } from "../local/operation-ledger";
import {
  executeProjectFeishuSync,
  getInternalStorageStatus,
  planProjectFeishuSync,
} from "../local/feishu-sync-service";
import {
  planFeishuInboxPull,
  pullFeishuInbox,
} from "../local/feishu-inbox-service";
import {
  archiveLocalProject,
  restoreLocalProject,
} from "../local/project-lifecycle-service";
import {
  getIterationService,
  IterationServiceError,
} from "../local/iteration-service";
import {
  getProductFeedbackService,
  ProductFeedbackServiceError,
} from "../local/product-feedback-service";
import {
  refreshMaintenanceInbox,
  refreshReporterMaintenanceUpdates,
  syncPendingFeedback,
} from "../local/feishu-feedback-service";

config({ path: path.resolve(process.cwd(), ".env.local"), override: false });

const MODE = process.env.COF_BP_MODE === "shared" ? "shared" : "local";
const HOST =
  process.env.COF_BP_HOST ?? (MODE === "shared" ? "0.0.0.0" : "127.0.0.1");
const PORT = Number(process.env.COF_BP_PORT ?? 4010);
const isProduction =
  process.env.NODE_ENV === "production" ||
  path.basename(import.meta.dirname) === "dist";

const app = express();
if (MODE === "shared") app.set("trust proxy", 1);
const server = createServer(app);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, SUPPORTED_EXTENSIONS.includes(extension));
  },
});

app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  if (MODE === "shared" || process.env.NODE_ENV === "production") {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    );
  }
  if (MODE === "shared")
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  response.setHeader(
    "X-Cofound-Data-Mode",
    MODE === "shared" ? "controlled-sharing" : "local-first"
  );
  const origin = request.headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const configuredOrigin = process.env.COF_BP_PUBLIC_BASE_URL
        ? new URL(process.env.COF_BP_PUBLIC_BASE_URL).origin
        : null;
      const localAllowed =
        MODE === "local" &&
        ["127.0.0.1", "localhost"].includes(originUrl.hostname);
      const sharedAllowed =
        MODE === "shared" && configuredOrigin === originUrl.origin;
      if (!localAllowed && !sharedAllowed) {
        response.status(403).json({ error: "请求来源不在允许范围内" });
        return;
      }
    } catch {
      response.status(400).json({ error: "无效来源" });
      return;
    }
  }
  next();
});
app.use(express.json({ limit: "1mb" }));

function isLoopbackAddress(address: string | undefined) {
  if (!address) return false;
  const normalized = address.toLowerCase().split("%")[0];
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1"
  );
}

app.use(
  ["/api/local", "/api/import", "/api/files", "/api/materials"],
  (request, response, next) => {
    if (MODE === "shared") {
      response.status(404).json({ error: "共享部署不开放本地资料库接口" });
      return;
    }
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      response.status(403).json({ error: "本地接口只接受本机连接" });
      return;
    }
    next();
  }
);

registerCollaborationRoutes(app);

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    host: HOST,
    mode: "local_only",
    projects: getDatabase().countProjects(),
  });
});

function iterationHttpError(error: unknown, response: express.Response) {
  if (error instanceof IterationServiceError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONFLICT" || error.code === "LEASE_EXPIRED"
          ? 409
          : error.code === "FORBIDDEN"
            ? 403
            : 500;
    response.status(status).json({ error: error.message });
    return;
  }
  response.status(500).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

function productFeedbackHttpError(error: unknown, response: express.Response) {
  if (error instanceof ProductFeedbackServiceError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONFLICT" || error.code === "LEASE_EXPIRED"
          ? 409
          : error.code === "FORBIDDEN"
            ? 403
            : 500;
    response.status(status).json({ error: error.message });
    return;
  }
  response.status(500).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

function localHttpHumanName(request: express.Request) {
  return (
    collaborationAuth.getSession(request)?.name.trim() ||
    collaborationAuth.ensureLocalAdmin().name.trim() ||
    "本机使用者"
  );
}

app.get("/api/local/iterations", (request, response) => {
  const parsed = iterationListInputSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().overview(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.get("/api/local/iterations/:id", (request, response) => {
  try {
    const detail = getIterationService().get(request.params.id);
    if (!detail) {
      response.status(404).json({ error: "迭代任务不存在" });
      return;
    }
    response.json(detail);
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post("/api/local/iterations/:id/claim", (request, response) => {
  const parsed = iterationClaimInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().claim(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post("/api/local/iterations/:id/progress", (request, response) => {
  const parsed = iterationProgressInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().update(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post("/api/local/iterations/:id/heartbeat", (request, response) => {
  const parsed = iterationHeartbeatInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().heartbeat(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post("/api/local/iterations/:id/requeue", (request, response) => {
  const parsed = iterationRequeueInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().requeueExpired(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post("/api/local/iterations/:id/needs-attention", (request, response) => {
  const parsed = iterationNeedsAttentionInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().needsAttention(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post("/api/local/iterations/:id/complete", (request, response) => {
  const parsed = iterationCompleteInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().complete(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post("/api/local/iterations/:id/finalize", (request, response) => {
  const parsed = iterationFinalizeInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getIterationService().finalize(parsed.data));
  } catch (error) {
    iterationHttpError(error, response);
  }
});

app.post(
  "/api/local/iterations/:id/preflight-finalize",
  (request, response) => {
    const parsed = iterationPreflightFinalizeInputSchema.safeParse({
      ...request.body,
      id: request.params.id,
    });
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      response.json(getIterationService().preflightFinalize(parsed.data));
    } catch (error) {
      iterationHttpError(error, response);
    }
  }
);

app.get("/api/local/product-feedback/capabilities", (_request, response) => {
  try {
    response.json(getProductFeedbackService().capabilities());
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.get("/api/local/product-feedback", (request, response) => {
  const parsed = productFeedbackListInputSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getProductFeedbackService().list(parsed.data));
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post("/api/local/product-feedback", (request, response) => {
  const parsed = productFeedbackSubmitInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.status(201).json(
      getProductFeedbackService().create({
        ...parsed.data,
        reporterName: localHttpHumanName(request),
      })
    );
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.get("/api/local/product-feedback/outbox/pending", (request, response) => {
  const parsed = productFeedbackPendingOutboxInputSchema.safeParse(
    request.query
  );
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getProductFeedbackService().pendingOutbox(parsed.data));
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post(
  "/api/local/product-feedback/outbox/:outboxId/synced",
  (request, response) => {
    const parsed = productFeedbackMarkSyncedInputSchema.safeParse({
      ...request.body,
      outboxId: request.params.outboxId,
    });
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      response.json(getProductFeedbackService().markOutboxSynced(parsed.data));
    } catch (error) {
      productFeedbackHttpError(error, response);
    }
  }
);

app.post(
  "/api/local/product-feedback/outbox/:outboxId/failed",
  (request, response) => {
    const parsed = productFeedbackMarkFailedInputSchema.safeParse({
      ...request.body,
      outboxId: request.params.outboxId,
    });
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      response.json(getProductFeedbackService().markOutboxFailed(parsed.data));
    } catch (error) {
      productFeedbackHttpError(error, response);
    }
  }
);

app.post("/api/local/product-feedback/ingest-remote", (request, response) => {
  const parsed = productFeedbackIngestRemoteInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getProductFeedbackService().ingestRemote(parsed.data));
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post(
  "/api/local/product-feedback/apply-maintenance-update",
  (request, response) => {
    const parsed = productFeedbackIngestRemoteInputSchema.safeParse(
      request.body
    );
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      response.json(
        getProductFeedbackService().applyRemoteMaintenanceUpdate(parsed.data)
      );
    } catch (error) {
      productFeedbackHttpError(error, response);
    }
  }
);

app.post(
  "/api/local/product-feedback/refresh-maintainer-inbox",
  async (_request, response) => {
    try {
      if (!getProductFeedbackService().capabilities().maintainerMode) {
        response.status(403).json({ error: "当前安装不是产品维护端" });
        return;
      }
      response.json(await refreshMaintenanceInbox());
    } catch (error) {
      productFeedbackHttpError(error, response);
    }
  }
);

app.post(
  "/api/local/product-feedback/refresh-status",
  async (_request, response) => {
    try {
      response.json(await refreshReporterMaintenanceUpdates());
    } catch (error) {
      productFeedbackHttpError(error, response);
    }
  }
);

app.get("/api/local/product-feedback/:id", (request, response) => {
  const parsed = productFeedbackIdInputSchema.safeParse({
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const detail = getProductFeedbackService().get(parsed.data.id);
    if (!detail) {
      response.status(404).json({ error: "产品反馈不存在" });
      return;
    }
    response.json(detail);
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post("/api/local/product-feedback/:id/claim", (request, response) => {
  const parsed = productFeedbackClaimInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getProductFeedbackService().claim(parsed.data));
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post("/api/local/product-feedback/:id/progress", (request, response) => {
  const parsed = productFeedbackProgressInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getProductFeedbackService().update(parsed.data));
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post("/api/local/product-feedback/:id/heartbeat", (request, response) => {
  const parsed = productFeedbackHeartbeatInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getProductFeedbackService().heartbeat(parsed.data));
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post(
  "/api/local/product-feedback/:id/needs-attention",
  (request, response) => {
    const parsed = productFeedbackNeedsAttentionInputSchema.safeParse({
      ...request.body,
      id: request.params.id,
    });
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      response.json(getProductFeedbackService().needsAttention(parsed.data));
    } catch (error) {
      productFeedbackHttpError(error, response);
    }
  }
);

app.post("/api/local/product-feedback/:id/complete", (request, response) => {
  const parsed = productFeedbackCompleteInputSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(getProductFeedbackService().complete(parsed.data));
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post("/api/local/product-feedback/:id/triage", (request, response) => {
  const parsed = productFeedbackTriageRequestSchema.safeParse({
    ...request.body,
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(
      getProductFeedbackService().triage({
        ...parsed.data,
        decidedBy: localHttpHumanName(request),
      })
    );
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

app.post(
  "/api/local/product-feedback/:id/close-maintenance",
  (request, response) => {
    const parsed = productFeedbackCloseMaintenanceRequestSchema.safeParse({
      ...request.body,
      id: request.params.id,
    });
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues });
      return;
    }
    try {
      response.json(
        getProductFeedbackService().closeMaintenance({
          ...parsed.data,
          decidedBy: localHttpHumanName(request),
        })
      );
    } catch (error) {
      productFeedbackHttpError(error, response);
    }
  }
);

app.post("/api/local/product-feedback/:id/sync", async (request, response) => {
  const parsed = productFeedbackIdInputSchema.safeParse({
    id: request.params.id,
  });
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    response.json(
      await syncPendingFeedback(undefined, { feedbackId: parsed.data.id })
    );
  } catch (error) {
    productFeedbackHttpError(error, response);
  }
});

const operationListQuerySchema = z.object({
  operationType: z.enum(OPERATION_TYPES).optional(),
  status: z.enum(OPERATION_STATUSES).optional(),
  projectId: z.string().trim().min(3).max(160).optional(),
  beforeId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

app.get("/api/local/operations", (request, response) => {
  const parsed = operationListQuerySchema.safeParse(request.query);
  if (!parsed.success)
    return response.status(400).json({ error: parsed.error.issues });
  response.json(getOperationLedger().listOperations(parsed.data));
});

app.get("/api/local/operations/:operationId", (request, response) => {
  try {
    const operation = getOperationLedger().getOperation(
      request.params.operationId
    );
    if (!operation)
      return response.status(404).json({ error: "运维记录不存在" });
    response.json(operation);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/local/internal-storage/status", async (_request, response) => {
  try {
    response.json(await getInternalStorageStatus());
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get(
  "/api/local/internal-storage/inbox/plan",
  async (_request, response) => {
    try {
      response.json(await planFeishuInboxPull());
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/local/internal-storage/inbox/pull",
  async (request, response) => {
    try {
      response.json(
        await pullFeishuInbox({ requestedBy: localHttpHumanName(request) })
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

const feishuSyncPlanSchema = z.object({
  requestedBy: z.string().trim().min(1).max(120),
});

app.post(
  "/api/local/projects/:projectId/feishu-sync/plan",
  async (request, response) => {
    const parsed = feishuSyncPlanSchema.safeParse(request.body);
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      response.json(
        await planProjectFeishuSync(
          request.params.projectId,
          parsed.data.requestedBy
        )
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

const feishuSyncExecuteSchema = feishuSyncPlanSchema.extend({
  planId: z.string().trim().min(8).max(120),
  confirmed: z.literal(true),
});

app.post(
  "/api/local/projects/:projectId/feishu-sync",
  async (request, response) => {
    const parsed = feishuSyncExecuteSchema.safeParse(request.body);
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      response.json(
        await executeProjectFeishuSync({
          projectId: request.params.projectId,
          ...parsed.data,
        })
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get("/api/local/projects", (request, response) => {
  const search =
    typeof request.query.search === "string" ? request.query.search : undefined;
  const industry =
    typeof request.query.industry === "string"
      ? request.query.industry
      : undefined;
  const round =
    typeof request.query.round === "string" ? request.query.round : undefined;
  const status =
    typeof request.query.status === "string" &&
    MANAGEMENT_DECISIONS.includes(request.query.status as ManagementDecision)
      ? (request.query.status as ManagementDecision)
      : undefined;
  response.json(
    getDatabase().listProjects({
      search,
      industries: industry ? [industry] : undefined,
      rounds: round ? [round] : undefined,
      statuses: status ? [status] : undefined,
    })
  );
});

app.get("/api/local/projects/recycle-bin", (_request, response) => {
  response.json(getDatabase().listArchivedProjects());
});

app.get("/api/local/projects/:projectId", (request, response) => {
  const project = getDatabase().getActiveProject(request.params.projectId);
  if (!project) return response.status(404).json({ error: "项目不存在" });
  response.json(project);
});

app.post("/api/local/projects/:projectId/archive", (request, response) => {
  try {
    response.json(
      archiveLocalProject({
        projectId: request.params.projectId,
        requestedBy: localHttpHumanName(request),
      })
    );
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/local/projects/:projectId/restore", (request, response) => {
  try {
    response.json(
      restoreLocalProject({
        projectId: request.params.projectId,
        requestedBy: localHttpHumanName(request),
      })
    );
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/local/import-path", async (request, response) => {
  try {
    const filePath =
      typeof request.body.filePath === "string" ? request.body.filePath : "";
    const projectId =
      typeof request.body.projectId === "string"
        ? request.body.projectId
        : undefined;
    if (!filePath) return response.status(400).json({ error: "filePath 必填" });
    response.status(201).json(await importFilePath(filePath, { projectId }));
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/local/scan", async (request, response) => {
  try {
    const directory =
      typeof request.body.directory === "string" ? request.body.directory : "";
    if (!directory)
      return response.status(400).json({ error: "directory 必填" });
    response.json(await scanDirectory(directory));
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/local/materials/import-path", async (request, response) => {
  try {
    const filePath =
      typeof request.body.filePath === "string" ? request.body.filePath : "";
    if (!filePath) return response.status(400).json({ error: "filePath 必填" });
    const projectId =
      typeof request.body.projectId === "string" && request.body.projectId
        ? request.body.projectId
        : undefined;
    const category = MATERIAL_CATEGORIES.includes(request.body.category)
      ? (request.body.category as MaterialCategory)
      : undefined;
    response
      .status(201)
      .json(await importAnyFilePath(filePath, { projectId, category }));
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/local/materials/inbox", (_request, response) => {
  const database = getDatabase();
  response.json({
    items: database.listPendingMaterials(),
    projects: database.listProjectIdentities(),
  });
});

app.post("/api/local/materials/:materialId/assign", (request, response) => {
  try {
    const projectId =
      typeof request.body.projectId === "string" ? request.body.projectId : "";
    if (!projectId)
      return response.status(400).json({ error: "projectId 必填" });
    getDatabase().assignMaterial(request.params.materialId, projectId);
    response.json({ ok: true });
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/local/custom-fields", (_request, response) => {
  response.json(getDatabase().listFieldDefinitions());
});

app.post("/api/local/custom-fields", (request, response) => {
  try {
    const label =
      typeof request.body.label === "string" ? request.body.label.trim() : "";
    const fieldType = CUSTOM_FIELD_TYPES.includes(request.body.fieldType)
      ? (request.body.fieldType as CustomFieldType)
      : null;
    if (!label || !fieldType)
      return response.status(400).json({ error: "字段名称或类型无效" });
    response.status(201).json(
      getDatabase().createFieldDefinition({
        label,
        fieldType,
        options: Array.isArray(request.body.options)
          ? request.body.options.map(String)
          : [],
        showInList: Boolean(request.body.showInList),
      })
    );
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post(
  "/api/local/projects/:projectId/custom-fields/:fieldKey",
  (request, response) => {
    try {
      response.json(
        getDatabase().setCustomFieldValue(
          request.params.projectId,
          request.params.fieldKey,
          request.body.value ?? null
        )
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get("/api/local/wechat/status", (_request, response) => {
  response.json(getWechatBpInbox().status(getWechatInboxJob()));
});

app.post("/api/local/wechat/initialize", (_request, response) => {
  try {
    response.json(getWechatBpInbox().initialize());
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/local/wechat/scan", (_request, response) => {
  try {
    response.status(202).json(startWechatInboxScan());
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post(
  "/api/local/projects/:projectId/analyze",
  async (request, response) => {
    try {
      response.json(await reanalyzeProject(request.params.projectId));
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/local/projects/:projectId/codex-analysis-tasks",
  async (request, response) => {
    const parsed = createCodexAnalysisTaskSchema.safeParse({
      ...request.body,
      projectId: request.params.projectId,
    });
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      response.status(201).json(await createCodexAnalysisTask(parsed.data));
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/local/projects/:projectId/codex-analysis-tasks",
  (request, response) => {
    try {
      const requestedLimit = Number(request.query.limit ?? 10);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;
      response.json(
        getDatabase().listCodexAnalysisTasks(request.params.projectId, limit)
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/local/projects/:projectId/codex-analysis-tasks/current",
  (request, response) => {
    try {
      response.json(
        getDatabase().getCurrentCodexAnalysisTask(request.params.projectId)
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post("/api/local/codex-analysis-tasks/claim", (request, response) => {
  const parsed = claimCodexAnalysisTaskSchema.safeParse(request.body);
  if (!parsed.success)
    return response.status(400).json({ error: parsed.error.issues });
  try {
    response.json(claimCodexAnalysisTask(parsed.data));
  } catch (error) {
    response.status(409).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post(
  "/api/local/codex-analysis-tasks/:taskId/progress",
  (request, response) => {
    const parsed = progressCodexAnalysisTaskSchema.safeParse({
      ...request.body,
      taskId: request.params.taskId,
    });
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      response.json(progressCodexAnalysisTask(parsed.data));
    } catch (error) {
      response.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/local/codex-analysis-tasks/:taskId/complete",
  (request, response) => {
    const parsed = completeCodexAnalysisTaskSchema.safeParse({
      ...request.body,
      taskId: request.params.taskId,
    });
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      response.json(completeCodexAnalysisTask(parsed.data));
    } catch (error) {
      response.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/local/codex-analysis-tasks/:taskId/fail",
  (request, response) => {
    const parsed = failCodexAnalysisTaskSchema.safeParse({
      ...request.body,
      taskId: request.params.taskId,
    });
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      response.json(failCodexAnalysisTask(parsed.data));
    } catch (error) {
      response.status(409).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/local/projects/:projectId/codex-analyses/prepare",
  (request, response) => {
    const parsed = prepareCodexAnalysisSchema.safeParse({
      ...request.body,
      projectId: request.params.projectId,
    });
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      response.status(201).json(prepareCodexAnalysis(parsed.data));
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/local/projects/:projectId/codex-analyses",
  (request, response) => {
    try {
      const requestedLimit = Number(request.query.limit ?? 10);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;
      response.json(
        getDatabase().listCodexAnalysisRuns(request.params.projectId, limit)
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post("/api/local/codex-analyses/:runId/complete", (request, response) => {
  const parsed = completeCodexAnalysisSchema.safeParse({
    ...request.body,
    runId: request.params.runId,
  });
  if (!parsed.success)
    return response.status(400).json({ error: parsed.error.issues });
  try {
    response.json(completeCodexAnalysis(parsed.data));
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post(
  "/api/local/codex-analyses/:runId/pages",
  async (request, response) => {
    const parsed = readPreparedCodexAnalysisPagesSchema.safeParse({
      ...request.body,
      runId: request.params.runId,
    });
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      const source = getDatabase().getPreparedCodexAnalysisSource(
        parsed.data.runId
      );
      if (source.status === "stale")
        throw new Error("Codex 分析任务已失效，请基于当前事实重新创建");
      const buffer = fs.readFileSync(source.storedPath);
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      if (sha256 !== source.sourceFileSha256)
        throw new Error("绑定原文件的 SHA-256 已变化，拒绝读取");
      const extraction = await extractDocument(
        buffer,
        source.originalName,
        source.mimeType
      );
      if (extraction.status !== "parsed")
        throw new Error(extraction.error ?? "绑定原文件无法提取文本");
      const requested = new Set(parsed.data.pageNumbers);
      let remainingCharacters = 24_000;
      let truncated = false;
      const pages = extraction.pages
        .filter(page => requested.has(page.page))
        .map(page => {
          const text = page.text.slice(0, Math.max(0, remainingCharacters));
          if (text.length < page.text.length) truncated = true;
          remainingCharacters -= text.length;
          return { page: page.page, text };
        })
        .filter(page => page.text.length > 0);
      getDatabase().recordPreparedCodexAnalysisPages(source.runId, pages);
      response.json({
        runId: source.runId,
        sourceFileId: source.sourceFileId,
        sourceFileSha256: source.sourceFileSha256,
        totalPages: extraction.pages.length,
        requestedPages: parsed.data.pageNumbers,
        missingPages: parsed.data.pageNumbers.filter(
          page => !extraction.pages.some(item => item.page === page)
        ),
        pages,
        truncated,
      });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get("/api/local/cleantech/status", (_request, response) => {
  response.json(getCleanTechEnhancementStatus());
});

const cleanTechFinancialAuditRequestSchema = z.object({
  manifestPath: z.string().trim().min(1).max(2_000),
  requestedBy: z.string().trim().min(1).max(120),
});

const cleanTechTagArraySchema = z
  .array(z.string().trim().min(1).max(80))
  .max(20);

const cleanTechPolicyMatchRequestSchema = z.object({
  requestedBy: z.string().trim().min(1).max(120),
  cleanEnergyApplicable: z.boolean(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  profileTags: z
    .object({
      industry: cleanTechTagArraySchema.optional(),
      stage: cleanTechTagArraySchema.optional(),
      need: cleanTechTagArraySchema.optional(),
      technology: cleanTechTagArraySchema.optional(),
      geography: cleanTechTagArraySchema.optional(),
      market: cleanTechTagArraySchema.optional(),
    })
    .strict(),
});

const cleanTechProjectMatchRequestSchema = z.object({
  requestedBy: z.string().trim().min(1).max(120),
  cleanEnergyApplicable: z.boolean(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  profileTags: z
    .object({
      industry: cleanTechTagArraySchema.optional(),
      need: cleanTechTagArraySchema.optional(),
      technology: cleanTechTagArraySchema.optional(),
      geography: cleanTechTagArraySchema.optional(),
      market: cleanTechTagArraySchema.optional(),
    })
    .strict(),
});

app.post(
  "/api/local/projects/:projectId/cleantech/financial-audit",
  async (request, response) => {
    const parsed = cleanTechFinancialAuditRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      const database = getDatabase();
      if (!database.getProject(request.params.projectId))
        return response.status(404).json({ error: "项目不存在" });
      response.json(
        await runCleanTechFinancialEvidenceAudit({
          projectId: request.params.projectId,
          manifestPath: parsed.data.manifestPath,
          requestedBy: parsed.data.requestedBy,
          outputRoot: path.join(database.dataDir, "cleantech-audits"),
        })
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/local/projects/:projectId/cleantech/policy-match",
  async (request, response) => {
    const parsed = cleanTechPolicyMatchRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      const database = getDatabase();
      if (!database.getProject(request.params.projectId))
        return response.status(404).json({ error: "项目不存在" });
      response.json(
        await runCleanTechPolicyMatch({
          projectId: request.params.projectId,
          requestedBy: parsed.data.requestedBy,
          cleanEnergyApplicable: parsed.data.cleanEnergyApplicable,
          profileTags: parsed.data.profileTags,
          asOf: parsed.data.asOf,
        })
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/local/projects/:projectId/cleantech/project-opportunity-match",
  async (request, response) => {
    const parsed = cleanTechProjectMatchRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return response.status(400).json({ error: parsed.error.issues });
    try {
      const database = getDatabase();
      if (!database.getProject(request.params.projectId))
        return response.status(404).json({ error: "项目不存在" });
      response.json(
        await runCleanTechProjectOpportunityMatch({
          projectId: request.params.projectId,
          requestedBy: parsed.data.requestedBy,
          cleanEnergyApplicable: parsed.data.cleanEnergyApplicable,
          profileTags: parsed.data.profileTags,
          asOf: parsed.data.asOf,
        })
      );
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post("/api/local/projects/:projectId/status", (request, response) => {
  const status = request.body.status as ManagementDecision;
  if (!MANAGEMENT_DECISIONS.includes(status))
    return response.status(400).json({ error: "无效状态" });
  try {
    getDatabase().updateManagementStatus(
      request.params.projectId,
      status,
      Boolean(request.body.locked),
      typeof request.body.note === "string" ? request.body.note : undefined
    );
    response.json(getDatabase().getProject(request.params.projectId));
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/import", upload.single("file"), async (request, response) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: "请选择受支持的 BP 文件" });
      return;
    }
    const result = await importDocument({
      buffer: request.file.buffer,
      originalName: request.file.originalname,
      mimeType: request.file.mimetype,
      projectId:
        typeof request.body.projectId === "string" && request.body.projectId
          ? request.body.projectId
          : undefined,
      projectName:
        typeof request.body.projectName === "string"
          ? request.body.projectName
          : undefined,
      description:
        typeof request.body.description === "string"
          ? request.body.description
          : undefined,
    });
    response.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/files/:fileId", (request, response) => {
  const database = getDatabase();
  const file = database.getFile(request.params.fileId);
  if (!file || typeof file.stored_path !== "string") {
    response.status(404).json({ error: "文件不存在" });
    return;
  }
  try {
    const absolute = database.resolveStoredFile(file.stored_path);
    if (!fs.existsSync(absolute)) {
      response.status(404).json({ error: "本地原件缺失，请从备份恢复" });
      return;
    }
    const displayName = String(file.original_name).replace(/[\r\n"]/g, "_");
    response.setHeader("Content-Type", String(file.mime_type));
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`
    );
    response.sendFile(absolute);
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/materials/:materialId", (request, response) => {
  const database = getDatabase();
  const material = database.getMaterial(request.params.materialId);
  if (!material || typeof material.stored_path !== "string") {
    response.status(404).json({ error: "资料不存在" });
    return;
  }
  try {
    const absolute = database.resolveStoredFile(material.stored_path);
    if (!fs.existsSync(absolute)) {
      response.status(404).json({ error: "本地资料缺失，请从备份恢复" });
      return;
    }
    const displayName = String(material.original_name).replace(/[\r\n"]/g, "_");
    response.setHeader("Content-Type", String(material.mime_type));
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`
    );
    response.sendFile(absolute);
  } catch (error) {
    response
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: createLocalContext,
  })
);

app.use(collaborationErrorHandler);

if (MODE === "shared") {
  app.get(["/", "/projects", "/projects/*"], (_request, response) =>
    response.redirect(302, "/portal")
  );
}

if (isProduction) {
  const publicDirectory = path.resolve(import.meta.dirname, "public");
  app.use(express.static(publicDirectory));
  app.use("*", (_request, response) =>
    response.sendFile(path.join(publicDirectory, "index.html"))
  );
} else {
  await setupVite(app, server);
}

server.listen(PORT, HOST, () => {
  const database = getDatabase();
  collaborationAuth.ensureLocalAdmin();
  console.log(`[Cofound BP Desk] http://${HOST}:${PORT}`);
  console.log(`[Cofound BP Desk] data: ${database.dataDir}`);
  console.log(`[Cofound BP Desk] mode: ${MODE}`);
  startCollaborationWorker();
});

function shutdown() {
  stopCollaborationWorker();
  server.close(() => {
    try {
      getDatabase().close();
    } finally {
      process.exit(0);
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
