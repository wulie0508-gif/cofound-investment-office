import type { CodexAnalysisTask, CodexAnalysisTaskStatus } from "@shared/bp";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Check,
  CircleDashed,
  Clock3,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import React from "react";
import {
  analysisTaskLeaseExpired,
  analysisTaskNeedsRestart,
  analysisTaskQueuedHandoffExpired,
  safeCodexThreadUri,
} from "./codex-analysis-options";

const ACTIVE_STEPS = ["已排队", "已领取", "分析中", "已完成"] as const;

const STATUS_COPY: Record<
  CodexAnalysisTaskStatus,
  { label: string; detail: string; step: number }
> = {
  queued: {
    label: "等待 Codex",
    detail: "任务已保存。Codex 打开后会从待办中领取。",
    step: 0,
  },
  claimed: {
    label: "Codex 已领取",
    detail: "本次分析已绑定当前项目与文件版本，正在准备分析。",
    step: 1,
  },
  analyzing: {
    label: "正在分析",
    detail: "Codex 正在核对事实、证据与投资判断。",
    step: 2,
  },
  completed: {
    label: "分析已完成",
    detail: "结果已回到项目，可继续在 Codex 中讨论。",
    step: 3,
  },
  failed: {
    label: "本次未完成",
    detail: "任务和历史均已保留，可以重新发起。",
    step: -1,
  },
  superseded: {
    label: "材料版本已更新",
    detail: "旧任务不会覆盖新版本，请重新发起分析。",
    step: -1,
  },
};

const SKILL_LABELS: Record<
  NonNullable<CodexAnalysisTask["selectedSkill"]>,
  string
> = {
  "review-early-stage-investment": "综合初筛",
  "assess-market-first": "市场与赛道",
  "assess-founder-first": "创始人与团队",
  "assess-long-term-value": "产业与长期价值",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function CodexAnalysisTaskProgress({
  task,
}: {
  task: CodexAnalysisTask | null;
}) {
  if (!task) {
    return (
      <div className="flex min-h-40 flex-col justify-center p-5" role="status">
        <CircleDashed
          className="size-5 text-muted-foreground"
          aria-hidden="true"
        />
        <h3 className="mt-3 text-sm font-bold">尚未生成结构化分析</h3>
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          自由对话不会强制写入看板。需要形成可复核结论时，再从左侧发起并绑定当前事实版本。
        </p>
      </div>
    );
  }

  const meta = STATUS_COPY[task.status];
  const queuedHandoffExpired = analysisTaskQueuedHandoffExpired(task);
  const leaseExpired = analysisTaskLeaseExpired(task);
  const needsRestart = analysisTaskNeedsRestart(task);
  const exceptional =
    needsRestart || task.status === "failed" || task.status === "superseded";
  const Icon = exceptional
    ? AlertCircle
    : task.status === "completed"
      ? Check
      : Clock3;
  const detail = task.errorDetail ?? task.progressMessage ?? meta.detail;
  const taskIsTerminal = ["completed", "failed", "superseded"].includes(
    task.status
  );
  const threadUri =
    taskIsTerminal && !needsRestart
      ? safeCodexThreadUri(task.codexThreadId)
      : null;
  const statusLabel = queuedHandoffExpired
    ? "启动未接手，可重新启动"
    : leaseExpired
      ? "执行中断，可恢复"
      : meta.label;
  const statusDetail = queuedHandoffExpired
    ? "Codex 没有在交接时间内接手。任务与证据仍已保留，点击“重新启动分析”即可继续。"
    : leaseExpired
      ? "Codex 的执行时间已经到期，任务与证据仍已保留。点击“重新启动分析”即可继续。"
      : detail;

  return (
    <div
      className="p-5"
      role={task.status === "failed" || needsRestart ? "alert" : "status"}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="field-label">CURRENT TASK · 当前任务</p>
          <h3 className="mt-2 flex items-center gap-2 text-sm font-bold">
            <Icon
              className={`size-4 ${exceptional ? "text-destructive" : "text-signal"}`}
              aria-hidden="true"
            />
            {statusLabel}
          </h3>
        </div>
        <time className="mono-meta shrink-0" dateTime={task.updatedAt}>
          {formatTime(task.updatedAt)}
        </time>
      </div>

      {!exceptional ? (
        <ol className="mt-5 grid grid-cols-4 gap-1" aria-label="分析进度">
          {ACTIVE_STEPS.map((label, index) => (
            <li key={label} className="min-w-0">
              <span
                className={`block h-1 ${index <= meta.step ? "bg-foreground" : "bg-border"}`}
                aria-hidden="true"
              />
              <span className="mt-2 block truncate text-[10px] font-semibold text-muted-foreground">
                {label}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {statusDetail}
      </p>
      {!taskIsTerminal && task.codexThreadId ? (
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          对话已经出现在 Codex
          任务列表中；完成后会自动打开，分析中无需切换进去。
        </p>
      ) : null}
      {task.selectedSkill ? (
        <p className="mt-3 text-[11px] font-semibold">
          当前视角：{SKILL_LABELS[task.selectedSkill]}
          {task.routerReason ? ` · ${task.routerReason}` : ""}
        </p>
      ) : null}
      {threadUri ? (
        <Button asChild variant="outline" size="sm" className="mt-4 gap-2">
          <a href={threadUri}>
            在 Codex 中继续
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </Button>
      ) : null}
      {task.launcherError ? (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
          Codex 窗口未自动打开：{task.launcherError}
        </p>
      ) : null}
      {task.status === "queued" && task.launcherMode === "desktop_fallback" ? (
        <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
          <RotateCcw className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          若 Codex 没有自动处理，请在 Codex 中说“处理 Cofound 分析待办”。
        </p>
      ) : null}
    </div>
  );
}
