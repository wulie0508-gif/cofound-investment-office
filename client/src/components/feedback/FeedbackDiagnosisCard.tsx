import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, RefreshCw, Sparkles } from "lucide-react";
import {
  FEEDBACK_DIAGNOSIS_LABELS,
  FEEDBACK_TRIAL_LABELS,
  FEEDBACK_TRIAGE_LABELS,
} from "./feedback-labels";
import type { FeedbackItem } from "./feedback-model";
import { FeedbackSyncBadge } from "./FeedbackSyncBadge";

type Copy = (chinese: string, english: string) => string;

export function FeedbackDiagnosisCard({
  item,
  codexLaunchAvailable,
  isOpeningCodex,
  isRetrying,
  copy,
  onOpenCodex,
  onRetrySync,
}: {
  item: FeedbackItem;
  codexLaunchAvailable: boolean;
  isOpeningCodex: boolean;
  isRetrying: boolean;
  copy: Copy;
  onOpenCodex: () => void;
  onRetrySync: () => void;
}) {
  const diagnosisStatus = FEEDBACK_DIAGNOSIS_LABELS[item.status];
  const triageStatus = FEEDBACK_TRIAGE_LABELS[item.triageStatus];
  const canOpenCodex = ["awaiting_diagnosis", "ready_for_codex"].includes(
    item.status
  );

  return (
    <section
      className="section-shell"
      aria-labelledby="feedback-diagnosis-title"
    >
      <div className="section-bar items-start">
        <div className="min-w-0">
          <p className="finance-kicker">LATEST FEEDBACK</p>
          <h2
            id="feedback-diagnosis-title"
            className="mt-1 truncate text-sm font-bold"
          >
            {item.title}
          </h2>
        </div>
        <FeedbackSyncBadge status={item.syncStatus} copy={copy} />
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-border bg-muted/20 p-3">
            <p className="field-label">{copy("Codex 整理", "Codex review")}</p>
            <p className="mt-1 text-xs font-bold">
              {copy(diagnosisStatus.chinese, diagnosisStatus.english)}
            </p>
          </div>
          <div className="border border-border bg-muted/20 p-3">
            <p className="field-label">
              {copy("维护进度", "Maintainer status")}
            </p>
            <p className="mt-1 text-xs font-bold">
              {copy(triageStatus.chinese, triageStatus.english)}
            </p>
          </div>
        </div>

        {canOpenCodex ? (
          <div>
            <p className="text-xs leading-5 text-muted-foreground">
              {copy(
                "打开自己的 Codex，让它读取并整理这条反馈。",
                "Open your Codex and ask it to review this feedback."
              )}
            </p>
            <Button
              type="button"
              className="mt-3 w-full gap-2 sm:w-auto"
              onClick={onOpenCodex}
              disabled={!codexLaunchAvailable || isOpeningCodex}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {isOpeningCodex
                ? copy("正在打开…", "Opening…")
                : copy("打开 Codex 整理", "Open Codex")}
            </Button>
            {!codexLaunchAvailable ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {copy(
                  "请从桌面打开 Codex，然后说“整理 Cofound 问题反馈”。",
                  "Open Codex from the desktop and ask it to review Cofound feedback."
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        {item.syncStatus === "failed" ? (
          <div className="border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-bold">
              {copy("本次发送尚未完成", "The update has not been sent")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {copy(
                "反馈仍安全保存在本机，可以稍后重新发送。",
                "The feedback remains safely stored on this device and can be sent again."
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={onRetrySync}
              disabled={isRetrying}
            >
              <RefreshCw
                className={`size-3.5 ${isRetrying ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {isRetrying
                ? copy("正在重新发送…", "Retrying…")
                : copy("重新发送", "Retry")}
            </Button>
          </div>
        ) : null}

        {item.diagnosis ? (
          <div className="border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="field-label">
                {copy("诊断预览", "Diagnosis preview")}
              </p>
              <Badge variant="outline">
                {copy(
                  FEEDBACK_TRIAL_LABELS[item.trialFixStatus].chinese,
                  FEEDBACK_TRIAL_LABELS[item.trialFixStatus].english
                )}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6">
              {item.diagnosis.summary}
            </p>

            {item.diagnosis.proposedActions.length ? (
              <div className="mt-4">
                <p className="field-label">
                  {copy("建议下一步", "Suggested next steps")}
                </p>
                <ul className="mt-2 space-y-2">
                  {item.diagnosis.proposedActions.map((action, index) => (
                    <li
                      key={`${action}-${index}`}
                      className="flex items-start gap-2 text-xs leading-5"
                    >
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-signal"
                        aria-hidden="true"
                      />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {item.diagnosis.openQuestions.length ? (
              <div className="mt-4 border-l-2 border-signal/35 pl-3">
                <p className="field-label">
                  {copy("仍需补充", "Open questions")}
                </p>
                <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                  {item.diagnosis.openQuestions.map((question, index) => (
                    <li key={`${question}-${index}`}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {item.diagnosis.risks.length ? (
              <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <span>{item.diagnosis.risks.join("；")}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {item.maintainerNote ? (
          <div className="border-t border-border pt-4">
            <p className="field-label">
              {copy("维护者回复", "Maintainer response")}
            </p>
            <p className="mt-2 text-sm font-semibold leading-6">
              {item.maintainerNote}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
