import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MANAGEMENT_DECISIONS } from "@shared/bp";
import {
  CalendarDays,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

export type DatePreset =
  | "all"
  | "today"
  | "last7days"
  | "thisMonth"
  | "last30days"
  | "thisYear"
  | "custom";

export type FilterDraft = {
  search: string;
  industry: string;
  round: string;
  status: string;
  traction: string;
  datePreset: DatePreset;
  importedAfter: string;
  importedBefore: string;
};

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-[13px] font-semibold text-foreground outline-none transition-colors hover:border-foreground/45 focus:border-signal focus:ring-2 focus:ring-signal/10";

const datePresets: Array<{ value: DatePreset; label: string }> = [
  { value: "all", label: "全部" },
  { value: "today", label: "今天" },
  { value: "last7days", label: "近 7 天" },
  { value: "thisMonth", label: "本月" },
  { value: "last30days", label: "近 30 天" },
  { value: "thisYear", label: "今年" },
  { value: "custom", label: "自定义" },
];

function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ProjectFiltersPanel({
  value,
  industries,
  rounds,
  onChange,
  onApply,
  onClear,
}: {
  value: FilterDraft;
  industries: string[];
  rounds: string[];
  onChange: (value: FilterDraft) => void;
  onApply: (value: FilterDraft) => void;
  onClear: () => void;
}) {
  const set = (key: keyof FilterDraft, fieldValue: string) =>
    onChange({ ...value, [key]: fieldValue });

  const chooseDatePreset = (preset: DatePreset) => {
    const next = {
      ...value,
      datePreset: preset,
      importedAfter: preset === "custom" ? value.importedAfter : "",
      importedBefore: preset === "custom" ? value.importedBefore : "",
    };
    onChange(next);
    if (preset !== "custom") onApply(next);
  };
  const activeFilterCount = [
    value.search,
    value.industry,
    value.round,
    value.status,
    value.traction,
    value.datePreset === "all" ? "" : value.datePreset,
  ].filter(Boolean).length;

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onApply(value);
      }}
      className="section-shell"
      aria-label="项目筛选"
    >
      <div className="section-bar">
        <div className="flex items-center gap-2">
          <SlidersHorizontal
            className="size-4 text-signal"
            aria-hidden="true"
          />
          <h2 className="section-title">筛选与检索</h2>
          {activeFilterCount ? (
            <span className="rounded-sm bg-signal/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-signal">
              {activeFilterCount}
            </span>
          ) : null}
        </div>
        <p className="hidden text-[11px] font-medium text-muted-foreground sm:block">
          名称、原文、行业、进度与入库日期
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-12">
        <FilterField label="快速检索" className="sm:col-span-2 lg:col-span-4">
          <span className="relative">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={value.search}
              onChange={event => set("search", event.target.value)}
              placeholder="公司、产品、创始人或 BP 原文"
              className="h-10 rounded-md bg-background pl-9 text-[13px] font-semibold focus-visible:border-signal"
            />
          </span>
        </FilterField>

        <FilterField label="标准行业" className="lg:col-span-2">
          <select
            aria-label="标准行业"
            value={value.industry}
            onChange={event => set("industry", event.target.value)}
            className={fieldClass}
          >
            <option value="">全部行业</option>
            {industries.map(industry => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="融资轮次" className="lg:col-span-2">
          <select
            aria-label="融资轮次"
            value={value.round}
            onChange={event => set("round", event.target.value)}
            className={fieldClass}
          >
            <option value="">全部轮次</option>
            {rounds.map(round => (
              <option key={round} value={round}>
                {round}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="管理判断" className="lg:col-span-2">
          <select
            aria-label="管理判断"
            value={value.status}
            onChange={event => set("status", event.target.value)}
            className={fieldClass}
          >
            <option value="">全部判断</option>
            {MANAGEMENT_DECISIONS.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="商业进展" className="lg:col-span-2">
          <select
            aria-label="商业进展"
            value={value.traction}
            onChange={event => set("traction", event.target.value)}
            className={fieldClass}
          >
            <option value="">全部进展</option>
            <option value="revenue">已披露收入</option>
            <option value="orders">已披露订单</option>
            <option value="loi">已披露 LOI</option>
          </select>
        </FilterField>
      </div>

      <div className="border-t border-border bg-muted/25 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden="true" />
              入库时间
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              aria-label="入库时间快捷筛选"
            >
              {datePresets.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={value.datePreset === option.value}
                  onClick={() => chooseDatePreset(option.value)}
                  className={`h-8 rounded-md border px-3 text-[11px] font-bold transition-colors ${
                    value.datePreset === option.value
                      ? "border-signal bg-signal text-signal-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/45 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {value.datePreset === "custom" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FilterField label="开始日期">
                <Input
                  aria-label="开始日期"
                  type="date"
                  value={value.importedAfter}
                  onChange={event => set("importedAfter", event.target.value)}
                  className="h-10 min-w-44 rounded-md bg-card text-sm font-medium"
                />
              </FilterField>
              <FilterField label="结束日期">
                <Input
                  aria-label="结束日期"
                  type="date"
                  value={value.importedBefore}
                  onChange={event => set("importedBefore", event.target.value)}
                  className="h-10 min-w-44 rounded-md bg-card text-sm font-medium"
                />
              </FilterField>
            </div>
          )}

          <div className="flex gap-2 xl:ml-auto">
            <Button type="submit" size="sm" className="min-w-24">
              查看结果
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClear}
              className="gap-2"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              重置
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
