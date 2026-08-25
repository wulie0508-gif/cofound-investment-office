import type {
  FeedbackCategory,
  FeedbackDiagnosisStatus,
  FeedbackImpact,
  FeedbackSyncStatus,
  FeedbackTriageStatus,
  FeedbackTrialStatus,
} from "./feedback-model";

type BilingualLabel = { chinese: string; english: string };

export const FEEDBACK_CATEGORY_LABELS: Record<
  FeedbackCategory,
  BilingualLabel
> = {
  interface: { chinese: "界面体验", english: "Interface" },
  analysis: { chinese: "分析能力", english: "Analysis" },
  workflow: { chinese: "使用流程", english: "Workflow" },
  sharing: { chinese: "分享协作", english: "Sharing" },
  data: { chinese: "字段与数据", english: "Data" },
  other: { chinese: "其他", english: "Other" },
};

export const FEEDBACK_IMPACT_LABELS: Record<
  FeedbackImpact,
  BilingualLabel & { detailZh: string; detailEn: string }
> = {
  minor: {
    chinese: "可以继续使用",
    english: "Can continue",
    detailZh: "不影响主要工作",
    detailEn: "Core work is unaffected",
  },
  inconvenient: {
    chinese: "使用不方便",
    english: "Inconvenient",
    detailZh: "需要绕一步完成",
    detailEn: "A workaround is needed",
  },
  blocked: {
    chinese: "当前无法继续",
    english: "Blocked",
    detailZh: "影响当前工作",
    detailEn: "Current work cannot continue",
  },
};

export const FEEDBACK_DIAGNOSIS_LABELS: Record<
  FeedbackDiagnosisStatus,
  BilingualLabel
> = {
  awaiting_diagnosis: { chinese: "等待整理", english: "Awaiting review" },
  ready_for_codex: { chinese: "等待 Codex", english: "Ready for Codex" },
  working: { chinese: "正在整理", english: "Reviewing" },
  checking: { chinese: "正在检查", english: "Checking" },
  needs_attention: { chinese: "需要补充", english: "Needs attention" },
  ready: { chinese: "诊断已完成", english: "Diagnosis ready" },
};

export const FEEDBACK_TRIAGE_LABELS: Record<
  FeedbackTriageStatus,
  BilingualLabel
> = {
  new: { chinese: "等待维护者查看", english: "Awaiting review" },
  needs_info: { chinese: "需要补充", english: "More information needed" },
  duplicate: { chinese: "已归入相似问题", english: "Related issue found" },
  deferred: { chinese: "暂不安排", english: "Deferred" },
  accepted: { chinese: "已纳入改进", english: "Accepted" },
  completed: { chinese: "已完成", english: "Completed" },
};

export const FEEDBACK_SYNC_LABELS: Record<FeedbackSyncStatus, BilingualLabel> =
  {
    pending: { chinese: "已保存，等待同步", english: "Saved, pending sync" },
    synced: { chinese: "已同步", english: "Synced" },
    failed: {
      chinese: "已保存，等待连接",
      english: "Saved, waiting for connection",
    },
  };

export const FEEDBACK_TRIAL_LABELS: Record<
  FeedbackTrialStatus,
  BilingualLabel
> = {
  not_attempted: { chinese: "尚未尝试", english: "Not attempted" },
  not_available: { chinese: "暂不适用", english: "Not available" },
  passed: { chinese: "试行可用", english: "Trial passed" },
  failed: { chinese: "试行未通过", english: "Trial did not pass" },
};

export function feedbackSyncTone(status: FeedbackSyncStatus) {
  if (status === "synced") return "border-signal/35 text-signal";
  if (status === "failed") return "border-destructive/35 text-destructive";
  return "border-border text-muted-foreground";
}
