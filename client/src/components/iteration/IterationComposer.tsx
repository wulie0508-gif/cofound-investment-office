import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  IterationCategory,
  IterationQualityMode,
} from "./iteration-model";
import { ArrowRight, SlidersHorizontal } from "lucide-react";

type Copy = (chinese: string, english: string) => string;

const CATEGORY_OPTIONS: Array<{
  value: IterationCategory;
  chinese: string;
  english: string;
}> = [
  { value: "interface", chinese: "界面体验", english: "Interface" },
  { value: "analysis", chinese: "分析能力", english: "Analysis" },
  { value: "workflow", chinese: "使用流程", english: "Workflow" },
  { value: "sharing", chinese: "外部分享", english: "Sharing" },
  { value: "data", chinese: "字段与数据", english: "Data" },
  { value: "other", chinese: "其他", english: "Other" },
];

const QUALITY_OPTIONS: Array<{
  value: IterationQualityMode;
  chinese: string;
  english: string;
}> = [
  { value: "quick", chinese: "快速调整", english: "Quick" },
  { value: "standard", chinese: "标准检查", english: "Standard" },
  { value: "deep", chinese: "全面检查", english: "Deep" },
];

export function IterationComposer({
  description,
  category,
  qualityMode,
  isSubmitting,
  copy,
  onDescriptionChange,
  onCategoryChange,
  onQualityModeChange,
  onSubmit,
}: {
  description: string;
  category: IterationCategory;
  qualityMode: IterationQualityMode;
  isSubmitting: boolean;
  copy: Copy;
  onDescriptionChange: (value: string) => void;
  onCategoryChange: (value: IterationCategory) => void;
  onQualityModeChange: (value: IterationQualityMode) => void;
  onSubmit: () => void;
}) {
  const canSubmit = description.trim().length >= 8 && !isSubmitting;

  return (
    <section className="section-shell" aria-labelledby="new-iteration-title">
      <div className="section-bar">
        <div>
          <p className="finance-kicker">NEW IMPROVEMENT</p>
          <h2 id="new-iteration-title" className="section-title mt-1">
            {copy("这次想改什么？", "What should improve?")}
          </h2>
        </div>
      </div>
      <form
        className="p-4 sm:p-5"
        onSubmit={event => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <label htmlFor="iteration-description" className="sr-only">
          {copy("迭代需求", "Improvement request")}
        </label>
        <Textarea
          id="iteration-description"
          value={description}
          onChange={event => onDescriptionChange(event.target.value)}
          placeholder={copy(
            "直接描述使用中遇到的问题，或者希望变得更好的地方……",
            "Describe what feels wrong or what you want to improve…"
          )}
          className="min-h-36 resize-y bg-background text-sm leading-6"
          maxLength={4_000}
        />
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {copy(
            "请用至少 8 个字说明希望改进的地方。",
            "Use at least 8 characters to describe what should improve."
          )}
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label htmlFor="iteration-category" className="field-label block">
              {copy("大致属于", "Area")}
            </label>
            <select
              id="iteration-category"
              value={category}
              onChange={event =>
                onCategoryChange(event.target.value as IterationCategory)
              }
              className="mt-1.5 h-9 min-w-44 border border-input bg-card px-3 text-sm"
            >
              {CATEGORY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {copy(option.chinese, option.english)}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" disabled={!canSubmit} className="gap-2">
            {isSubmitting
              ? copy("正在记录…", "Saving…")
              : copy("记录为迭代待办", "Save improvement")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <details className="mt-4 border-t border-border pt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            {copy("检查强度（默认标准）", "Review depth (standard by default)")}
          </summary>
          <div className="mt-3 max-w-sm">
            <label htmlFor="iteration-quality" className="sr-only">
              {copy("检查强度", "Review depth")}
            </label>
            <select
              id="iteration-quality"
              value={qualityMode}
              onChange={event =>
                onQualityModeChange(event.target.value as IterationQualityMode)
              }
              className="h-9 w-full border border-input bg-card px-3 text-sm"
            >
              {QUALITY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {copy(option.chinese, option.english)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {copy(
                "标准检查适合大多数修改；只有涉及多个流程时才需要全面检查。",
                "Standard review fits most changes; use deep review only for changes across several workflows."
              )}
            </p>
          </div>
        </details>
      </form>
    </section>
  );
}
