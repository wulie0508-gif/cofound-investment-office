import type {
  ProductFeedbackDiagnosis,
  ProductFeedbackDiagnosisStatus,
  ProductFeedbackDto,
  ProductFeedbackImpact,
  ProductFeedbackSyncStatus,
  ProductFeedbackTriageInput,
  ProductFeedbackTriageStatus,
  ProductFeedbackTrialStatus,
} from "@shared/product-feedback";

export type FeedbackItem = ProductFeedbackDto;
export type FeedbackCategory = ProductFeedbackDto["category"];
export type FeedbackImpact = ProductFeedbackImpact;
export type FeedbackDiagnosisStatus = ProductFeedbackDiagnosisStatus;
export type FeedbackSyncStatus = ProductFeedbackSyncStatus;
export type FeedbackTriageStatus = ProductFeedbackTriageStatus;
export type FeedbackTrialStatus = ProductFeedbackTrialStatus;
export type FeedbackDiagnosis = ProductFeedbackDiagnosis;
export type FeedbackTriageAction = ProductFeedbackTriageInput["action"];

export function formatFeedbackTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
