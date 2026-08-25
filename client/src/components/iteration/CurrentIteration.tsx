import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, RotateCcw, Sparkles } from "lucide-react";
import { IterationDecisionPanel } from "./IterationDecisionPanel";
import { ITERATION_STATUS_COPY, iterationStatusTone } from "./iteration-labels";
import {
  formatIterationTime,
  type IterationDecision,
  type IterationItem,
} from "./iteration-model";
import { VerificationSummary } from "./VerificationSummary";

type Copy = (chinese: string, english: string) => string;

export function CurrentIteration({
  item,
  codexLaunchAvailable,
  isOpeningCodex,
  isDeciding,
  isRequeueing,
  copy,
  onOpenCodex,
  onRequeue,
  onDecide,
}: {
  item: IterationItem | null;
  codexLaunchAvailable: boolean;
  isOpeningCodex: boolean;
  isDeciding: boolean;
  isRequeueing: boolean;
  copy: Copy;
  onOpenCodex: () => void;
  onRequeue: (id: string) => void;
  onDecide: (id: string, action: IterationDecision, note?: string) => void;
}) {
  if (!item)
    return (
      <section className="section-shell" aria-labelledby="current-title">
        <div className="p-6 text-center sm:p-10" role="status">
          <Sparkles
            className="mx-auto size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 id="current-title" className="mt-4 text-sm font-bold">
            {copy("目前没有进行中的迭代", "No active improvement")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">
            {copy(
              "在需求框中记录一个问题，它会成为 Codex 下一次处理的待办。",
              "Describe an issue in the request box and it will become the next Codex task."
            )}
          </p>
        </div>
      </section>
    );

  const status = ITERATION_STATUS_COPY[item.status];
  const canDecide =
    item.status === "ready" || item.status === "needs_attention";

  return (
    <section className="section-shell" aria-labelledby="current-title">
      <div className="section-bar items-start">
        <div className="min-w-0">
          <p className="finance-kicker">CURRENT IMPROVEMENT</p>
          <h2 id="current-title" className="mt-1 truncate text-sm font-bold">
            {item.title}
          </h2>
        </div>
        <Badge variant="outline" className={iterationStatusTone(item.status)}>
          {copy(status.chinese, status.english)}
        </Badge>
      </div>

      <div className="p-4 sm:p-5">
        <p className="text-sm font-medium leading-6">{item.description}</p>
        <p className="mt-3 text-[11px] font-medium text-muted-foreground">
          {item.requestedBy} · {formatIterationTime(item.createdAt)}
          {item.currentRound > 1
            ? ` · ${copy(`第 ${item.currentRound} 轮`, `Round ${item.currentRound}`)}`
            : ""}
        </p>

        <div
          className="mt-5 border-l-2 border-signal/40 bg-muted/30 px-4 py-3"
          aria-live="polite"
        >
          <p className="text-xs font-bold">
            {copy(status.chinese, status.english)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {item.canRequeue
              ? copy(
                  "上一次处理没有继续完成，可以安全地重新加入待办。",
                  "The previous run did not finish. You can safely return it to the task list."
                )
              : copy(status.detailZh, status.detailEn)}
          </p>
        </div>

        {item.canRequeue &&
        (item.status === "working" || item.status === "checking") ? (
          <div
            className="mt-5 border border-border bg-muted/30 p-4"
            role="alert"
          >
            <p className="text-xs font-bold">
              {copy("这轮处理似乎已经停下", "This improvement appears paused")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {copy(
                "重新加入待办后，再打开 Codex 即可继续处理。",
                "Return it to the task list, then open Codex to continue."
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full gap-2 sm:w-auto"
              onClick={() => onRequeue(item.id)}
              disabled={isRequeueing}
            >
              <RotateCcw
                className={`size-3.5 ${isRequeueing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {isRequeueing
                ? copy("正在恢复…", "Restoring…")
                : copy("重新加入 Codex 待办", "Return to Codex tasks")}
            </Button>
          </div>
        ) : null}

        {["ready_for_codex", "approved"].includes(item.status) ? (
          <Button
            type="button"
            className="mt-5 w-full gap-2 sm:w-auto"
            onClick={onOpenCodex}
            disabled={!codexLaunchAvailable || isOpeningCodex}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {isOpeningCodex
              ? copy("正在打开…", "Opening…")
              : item.status === "approved"
                ? copy("打开 Codex 完成应用", "Open Codex to apply")
                : copy("打开 Codex", "Open Codex")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}

        {["ready_for_codex", "approved"].includes(item.status) &&
        !codexLaunchAvailable ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {copy(
              item.status === "approved"
                ? "请从桌面图标打开 Codex，然后说“处理 Cofound 迭代待办”，完成本轮应用。"
                : "请从桌面图标打开 Codex，然后说“处理 Cofound 迭代待办”。",
              item.status === "approved"
                ? "Open Codex from the desktop icon and ask it to handle Cofound improvements to finish applying this round."
                : "Open Codex from the desktop icon and ask it to handle Cofound improvements."
            )}
          </p>
        ) : null}

        {canDecide ? (
          <IterationDecisionPanel
            key={`${item.id}-${item.currentRound}-${item.status}`}
            itemId={item.id}
            status={item.status}
            isPending={isDeciding}
            copy={copy}
            onDecide={onDecide}
          />
        ) : null}
      </div>

      {item.result ? (
        <VerificationSummary result={item.result} copy={copy} />
      ) : null}
    </section>
  );
}
