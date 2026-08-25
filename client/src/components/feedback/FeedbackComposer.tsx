import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_IMPACT_LABELS,
} from "./feedback-labels";
import type { FeedbackCategory, FeedbackImpact } from "./feedback-model";

type Copy = (chinese: string, english: string) => string;

export function FeedbackComposer({
  description,
  expectedOutcome,
  category,
  impact,
  isSubmitting,
  copy,
  onDescriptionChange,
  onExpectedOutcomeChange,
  onCategoryChange,
  onImpactChange,
  onSubmit,
}: {
  description: string;
  expectedOutcome: string;
  category: FeedbackCategory;
  impact: FeedbackImpact;
  isSubmitting: boolean;
  copy: Copy;
  onDescriptionChange: (value: string) => void;
  onExpectedOutcomeChange: (value: string) => void;
  onCategoryChange: (value: FeedbackCategory) => void;
  onImpactChange: (value: FeedbackImpact) => void;
  onSubmit: () => void;
}) {
  const canSubmit = description.trim().length >= 8 && !isSubmitting;

  return (
    <section
      className="section-shell"
      aria-labelledby="feedback-composer-title"
    >
      <div className="section-bar">
        <div>
          <p className="finance-kicker">NEW FEEDBACK</p>
          <h2 id="feedback-composer-title" className="section-title mt-1">
            {copy("这次遇到了什么？", "What happened?")}
          </h2>
        </div>
      </div>

      <form
        className="space-y-5 p-4 sm:p-5"
        onSubmit={event => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <div>
          <label htmlFor="feedback-description" className="field-label block">
            {copy("问题描述", "Issue description")}
          </label>
          <Textarea
            id="feedback-description"
            value={description}
            onChange={event => onDescriptionChange(event.target.value)}
            placeholder={copy(
              "例如：在项目列表选择日期后，返回页面时筛选条件消失了。",
              "For example: the date filter disappears after returning to the project list."
            )}
            className="mt-2 min-h-28 resize-y bg-background text-sm leading-6"
            maxLength={4_000}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {copy(
              "请用至少 8 个字说明现象，不需要描述技术原因。",
              "Use at least 8 characters. You do not need to explain the technical cause."
            )}
          </p>
        </div>

        <div>
          <label htmlFor="feedback-outcome" className="field-label block">
            {copy("期望结果（选填）", "Expected outcome (optional)")}
          </label>
          <Textarea
            id="feedback-outcome"
            value={expectedOutcome}
            onChange={event => onExpectedOutcomeChange(event.target.value)}
            placeholder={copy(
              "例如：回到列表后仍保留之前选择的日期。",
              "For example: keep the selected date after returning to the list."
            )}
            className="mt-2 min-h-20 resize-y bg-background text-sm leading-6"
            maxLength={2_000}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="feedback-category" className="field-label block">
              {copy("功能分类", "Area")}
            </label>
            <select
              id="feedback-category"
              value={category}
              onChange={event =>
                onCategoryChange(event.target.value as FeedbackCategory)
              }
              className="mt-2 h-10 w-full border border-input bg-card px-3 text-sm"
            >
              {Object.entries(FEEDBACK_CATEGORY_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {copy(label.chinese, label.english)}
                  </option>
                )
              )}
            </select>
          </div>

          <fieldset>
            <legend className="field-label">
              {copy("影响程度", "Impact")}
            </legend>
            <div className="mt-2 grid gap-2">
              {Object.entries(FEEDBACK_IMPACT_LABELS).map(([value, label]) => {
                const selected = impact === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    className={`border px-3 py-2 text-left transition-colors ${
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                    onClick={() => onImpactChange(value as FeedbackImpact)}
                  >
                    <span className="block text-xs font-bold">
                      {copy(label.chinese, label.english)}
                    </span>
                    <span
                      className={`mt-0.5 block text-[11px] ${
                        selected
                          ? "text-background/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {copy(label.detailZh, label.detailEn)}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="border-l-2 border-signal/40 bg-muted/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-signal"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold">
                {copy("发送范围清楚可控", "A clear, limited submission")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {copy(
                  "确认后，将同步本页填写内容、你的显示名、提交时间，以及应用和分析能力版本。Codex 整理完成后，还会补充经过安全处理的诊断摘要、建议、检查与风险。Codex 原对话、本机路径和未选择的附件不会发送。",
                  "This sends the content on this page, your display name, submission time, and app and capability versions. After Codex reviews it, a safely prepared diagnosis, actions, checks, and risks are added. Codex conversations, local paths, and unselected attachments are not sent."
                )}
              </p>
              <p className="mt-1 text-xs leading-5 text-destructive">
                {copy(
                  "请勿填写 BP 正文、密码、访问码或个人联系方式。",
                  "Do not include BP content, passwords, access codes, or personal contact details."
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">
            {copy(
              "点击即表示你确认将上述内容上报给企业内部维护者。",
              "By continuing, you confirm that the content described above may be reported to the internal maintainer."
            )}
          </p>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="shrink-0 gap-2"
          >
            {isSubmitting
              ? copy("正在上报…", "Reporting…")
              : copy("确认并上报问题", "Confirm and report")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </section>
  );
}
