import type { IterationStatus } from "./iteration-model";

export type IterationStatusCopy = {
  chinese: string;
  english: string;
  detailZh: string;
  detailEn: string;
};

export const ITERATION_STATUS_COPY: Record<
  IterationStatus,
  IterationStatusCopy
> = {
  ready_for_codex: {
    chinese: "等待 Codex",
    english: "Ready for Codex",
    detailZh: "需求已经保存。打开 Codex 后，让它处理 Cofound 迭代待办。",
    detailEn:
      "The request is saved. Open Codex and ask it to handle Cofound improvements.",
  },
  working: {
    chinese: "正在处理",
    english: "In progress",
    detailZh: "Codex 正在整理并处理这轮修改。",
    detailEn: "Codex is preparing and applying this improvement.",
  },
  checking: {
    chinese: "正在检查",
    english: "Checking",
    detailZh: "正在确认新版页面、数据和核心流程。",
    detailEn:
      "The updated interface, data, and key workflows are being checked.",
  },
  needs_attention: {
    chinese: "需要继续处理",
    english: "Needs attention",
    detailZh: "目前还有未通过的检查项，暂时不会启用。",
    detailEn:
      "Some checks still need work, so this version will not be enabled yet.",
  },
  ready: {
    chinese: "等你确认",
    english: "Ready for review",
    detailZh: "本轮结果已经准备好，请确认采用、继续调整或暂时搁置。",
    detailEn:
      "The result is ready. Accept it, request another revision, or pause it.",
  },
  approved: {
    chinese: "已经确认",
    english: "Approved",
    detailZh: "你已确认采用。请点击“打开 Codex 完成应用”。",
    detailEn:
      "You approved this result. Select Open Codex to finish applying it.",
  },
  completed: {
    chinese: "本机已更新",
    english: "Completed",
    detailZh: "本轮改进已经完成并留下记录。",
    detailEn: "This improvement is complete and recorded.",
  },
  paused: {
    chinese: "本轮已暂停",
    english: "Paused",
    detailZh: "这轮修改不会继续执行，可以之后重新提出。",
    detailEn: "This improvement will not continue unless requested again.",
  },
};

export function iterationStatusTone(status: IterationStatus) {
  if (status === "needs_attention")
    return "border-destructive/35 text-destructive";
  if (["working", "checking", "ready"].includes(status))
    return "border-signal/35 bg-signal/5 text-signal";
  return "border-border text-muted-foreground";
}
