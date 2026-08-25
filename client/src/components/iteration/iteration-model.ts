import type {
  IterationCategory,
  IterationDecision,
  IterationOverviewDto,
  IterationQuality,
  IterationResult,
  IterationStatus,
  IterationTaskDto,
} from "@shared/iteration";

export type {
  IterationCategory,
  IterationDecision,
  IterationResult,
  IterationStatus,
};

export type IterationQualityMode = IterationQuality;
export type IterationItem = IterationTaskDto;
export type IterationVersion = IterationOverviewDto["version"];
export type IterationCheck = IterationResult["checks"][number];

export const ACTIVE_ITERATION_STATUSES = new Set<IterationStatus>([
  "ready_for_codex",
  "working",
  "checking",
  "needs_attention",
  "ready",
  "approved",
]);

export function formatIterationTime(value: string) {
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
