import type { CodexAnalysisTask, CodexAnalysisTaskMode } from "@shared/bp";

export const ANALYSIS_MODES: Array<{
  value: CodexAnalysisTaskMode;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "不指定 · 开放分析",
    description:
      "不限定分析路径，由 Codex 根据你的问题、项目材料与对话上下文自主使用合适的 Skill。",
  },
  {
    value: "review-early-stage-investment",
    label: "综合初筛",
    description: "同时检查商业验证、融资条件、风险和下一步核实重点。",
  },
  {
    value: "assess-market-first",
    label: "市场与赛道",
    description: "着重判断市场空间、竞争格局、拐点和可持续壁垒。",
  },
  {
    value: "assess-founder-first",
    label: "创始人与团队",
    description: "着重判断创始人认知、执行记录、互补性与抗压能力。",
  },
  {
    value: "assess-long-term-value",
    label: "产业与长期价值",
    description: "着重判断产业位置、长期复利、资源协同与退出路径。",
  },
];

const CODEX_THREAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const QUEUED_HANDOFF_GRACE_MS = 5 * 60_000;

export function safeCodexThreadUri(threadId: string | null) {
  return threadId && CODEX_THREAD_ID.test(threadId)
    ? `codex://threads/${threadId}`
    : null;
}

export function analysisTaskLeaseExpired(
  task: CodexAnalysisTask | null,
  currentTime = Date.now()
) {
  if (!task || (task.status !== "claimed" && task.status !== "analyzing"))
    return false;
  const expiresAt = task.leaseExpiresAt
    ? Date.parse(task.leaseExpiresAt)
    : Number.NaN;
  return !Number.isFinite(expiresAt) || expiresAt <= currentTime;
}

export function analysisTaskQueuedHandoffExpired(
  task: CodexAnalysisTask | null,
  currentTime = Date.now()
) {
  if (!task || task.status !== "queued") return false;
  const updatedAt = Date.parse(task.updatedAt);
  return (
    !Number.isFinite(updatedAt) ||
    currentTime - updatedAt > QUEUED_HANDOFF_GRACE_MS
  );
}

export function analysisTaskNeedsRestart(
  task: CodexAnalysisTask | null,
  currentTime = Date.now()
) {
  return (
    analysisTaskQueuedHandoffExpired(task, currentTime) ||
    analysisTaskLeaseExpired(task, currentTime)
  );
}

export function analysisTaskIsLive(
  task: CodexAnalysisTask | null,
  currentTime = Date.now()
) {
  if (!task) return false;
  if (task.status === "queued")
    return !analysisTaskQueuedHandoffExpired(task, currentTime);
  return (
    (task.status === "claimed" || task.status === "analyzing") &&
    !analysisTaskLeaseExpired(task, currentTime)
  );
}
