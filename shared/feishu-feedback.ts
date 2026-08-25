import type { ProductFeedbackHandoffPayload } from "./product-feedback";

export const FEISHU_PRODUCT_FEEDBACK_TABLE_NAME = "产品改进台账";

export const FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES = {
  collaborationKey: "协作键",
  feedbackId: "反馈编号",
  latestOutboxId: "最近发件箱 ID",
  handoffFingerprint: "冻结内容指纹",
  frozenPayload: "冻结上报内容",
  handoffKind: "上报类型",
  applicationVersion: "应用版本",
  capabilityPackVersion: "能力包版本",
  sequence: "上报序号",
  round: "上报轮次",
  reporterName: "提交人",
  title: "问题标题",
  description: "问题描述",
  expectedOutcome: "期望结果",
  category: "功能分类",
  impact: "影响程度",
  submittedAt: "提交时间",
  diagnosisSummary: "Codex 诊断摘要",
  proposedActions: "建议处理动作",
  diagnosisChecks: "诊断检查",
  diagnosisRisks: "诊断风险",
  openQuestions: "仍需补充信息",
  trialFixStatus: "试行修复状态",
  sourceUpdatedAt: "来源更新时间",
  processingStatus: "处理状态",
  maintainerReply: "维护者回复",
  maintainerName: "处理人",
  maintenanceTaskId: "维护任务编号",
  maintenanceUpdatedAt: "处理更新时间",
} as const;

export type FeishuProductFeedbackFieldType = "text" | "number" | "datetime";
export type FeishuProductFeedbackFieldOwner = "cofound" | "maintainer";

export const FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION = [
  {
    key: "collaborationKey",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.collaborationKey,
    type: "text",
    owner: "cofound",
  },
  {
    key: "feedbackId",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.feedbackId,
    type: "text",
    owner: "cofound",
  },
  {
    key: "latestOutboxId",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.latestOutboxId,
    type: "text",
    owner: "cofound",
  },
  {
    key: "handoffFingerprint",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.handoffFingerprint,
    type: "text",
    owner: "cofound",
  },
  {
    key: "frozenPayload",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.frozenPayload,
    type: "text",
    owner: "cofound",
  },
  {
    key: "handoffKind",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.handoffKind,
    type: "text",
    owner: "cofound",
  },
  {
    key: "applicationVersion",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.applicationVersion,
    type: "text",
    owner: "cofound",
  },
  {
    key: "capabilityPackVersion",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.capabilityPackVersion,
    type: "text",
    owner: "cofound",
  },
  {
    key: "round",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.round,
    type: "number",
    owner: "cofound",
  },
  {
    key: "sequence",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.sequence,
    type: "number",
    owner: "cofound",
  },
  {
    key: "reporterName",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.reporterName,
    type: "text",
    owner: "cofound",
  },
  {
    key: "title",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.title,
    type: "text",
    owner: "cofound",
  },
  {
    key: "description",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.description,
    type: "text",
    owner: "cofound",
  },
  {
    key: "expectedOutcome",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.expectedOutcome,
    type: "text",
    owner: "cofound",
  },
  {
    key: "category",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.category,
    type: "text",
    owner: "cofound",
  },
  {
    key: "impact",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.impact,
    type: "text",
    owner: "cofound",
  },
  {
    key: "submittedAt",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.submittedAt,
    type: "datetime",
    owner: "cofound",
  },
  {
    key: "diagnosisSummary",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.diagnosisSummary,
    type: "text",
    owner: "cofound",
  },
  {
    key: "proposedActions",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.proposedActions,
    type: "text",
    owner: "cofound",
  },
  {
    key: "diagnosisChecks",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.diagnosisChecks,
    type: "text",
    owner: "cofound",
  },
  {
    key: "diagnosisRisks",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.diagnosisRisks,
    type: "text",
    owner: "cofound",
  },
  {
    key: "openQuestions",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.openQuestions,
    type: "text",
    owner: "cofound",
  },
  {
    key: "trialFixStatus",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.trialFixStatus,
    type: "text",
    owner: "cofound",
  },
  {
    key: "sourceUpdatedAt",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.sourceUpdatedAt,
    type: "datetime",
    owner: "cofound",
  },
  {
    key: "processingStatus",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.processingStatus,
    type: "text",
    owner: "maintainer",
  },
  {
    key: "maintainerReply",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.maintainerReply,
    type: "text",
    owner: "maintainer",
  },
  {
    key: "maintainerName",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.maintainerName,
    type: "text",
    owner: "maintainer",
  },
  {
    key: "maintenanceTaskId",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.maintenanceTaskId,
    type: "text",
    owner: "maintainer",
  },
  {
    key: "maintenanceUpdatedAt",
    name: FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES.maintenanceUpdatedAt,
    type: "datetime",
    owner: "maintainer",
  },
] as const satisfies ReadonlyArray<{
  key: keyof typeof FEISHU_PRODUCT_FEEDBACK_FIELD_NAMES;
  name: string;
  type: FeishuProductFeedbackFieldType;
  owner: FeishuProductFeedbackFieldOwner;
}>;

export const FEISHU_PRODUCT_FEEDBACK_REQUIRED_FIELDS =
  FEISHU_PRODUCT_FEEDBACK_FIELD_PROJECTION.map(field => field.name);

export type FeishuProductFeedbackConfig = {
  baseToken: string;
  tableId: string;
};

export const FEISHU_FEEDBACK_ADAPTER_ERROR_CODES = [
  "not_configured",
  "invalid_payload",
  "auth_unavailable",
  "schema_mismatch",
  "remote_read_failed",
  "remote_write_failed",
  "payload_conflict",
  "duplicate_collaboration_key",
  "readback_failed",
] as const;

export type FeishuFeedbackAdapterErrorCode =
  (typeof FEISHU_FEEDBACK_ADAPTER_ERROR_CODES)[number];

export type FeishuProductFeedbackSyncReceipt = {
  collaborationKey: string;
  feedbackId: string;
  action: "created" | "updated" | "skipped_existing";
  recordId: string;
  readBackVerified: true;
  readBackChecks: number;
};

export type FeishuMaintenanceInboxItem = {
  recordId: string;
  collaborationKey: string;
  feedbackId: string;
  payload: ProductFeedbackHandoffPayload;
  processingStatus: string | null;
  maintainerReply: string | null;
  maintainerName: string | null;
  maintenanceTaskId: string | null;
  maintenanceUpdatedAt: string | null;
};

export type FeishuMaintenanceInboxSnapshot = {
  items: FeishuMaintenanceInboxItem[];
  pageCount: number;
  readAt: string;
};

export type FeishuReporterMaintenanceSnapshot = {
  items: FeishuMaintenanceInboxItem[];
  queryCount: number;
  readAt: string;
};
