import Navbar from "@/components/Navbar";
import { ProjectCard } from "@/components/projects/ProjectCard";
import {
  ProjectFiltersPanel,
  type DatePreset,
  type FilterDraft,
} from "@/components/projects/ProjectFiltersPanel";
import { WorkspaceStatus } from "@/components/projects/WorkspaceStatus";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  INDUSTRY_CATEGORIES,
  type ManagementDecision,
  type ProjectFilters,
} from "@shared/bp";
import { Database, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const emptyDraft: FilterDraft = {
  search: "",
  industry: "",
  round: "",
  status: "",
  traction: "",
  datePreset: "all",
  importedAfter: "",
  importedBefore: "",
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

export function dateRangeForPreset(
  preset: DatePreset,
  customStart: string,
  customEnd: string,
  now = new Date()
) {
  let start: Date | null = null;
  let end: Date | null = null;
  const today = startOfLocalDay(now);

  if (preset === "today") {
    start = today;
    end = endOfLocalDay(today);
  } else if (preset === "last7days") {
    start = new Date(today);
    start.setDate(start.getDate() - 6);
    end = endOfLocalDay(today);
  } else if (preset === "thisMonth") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = endOfLocalDay(today);
  } else if (preset === "last30days") {
    start = new Date(today);
    start.setDate(start.getDate() - 29);
    end = endOfLocalDay(today);
  } else if (preset === "thisYear") {
    start = new Date(today.getFullYear(), 0, 1);
    end = endOfLocalDay(today);
  } else if (preset === "custom") {
    start = parseLocalDate(customStart);
    const customEndDate = parseLocalDate(customEnd);
    end = customEndDate ? endOfLocalDay(customEndDate) : null;
  }

  return {
    importedAfter: start?.toISOString(),
    importedBefore: end?.toISOString(),
  };
}

function toFilters(draft: FilterDraft): ProjectFilters {
  const dateRange = dateRangeForPreset(
    draft.datePreset,
    draft.importedAfter,
    draft.importedBefore
  );
  return {
    search: draft.search.trim() || undefined,
    industries: draft.industry ? [draft.industry] : undefined,
    rounds: draft.round ? [draft.round] : undefined,
    statuses: draft.status ? [draft.status as ManagementDecision] : undefined,
    traction: (draft.traction || undefined) as ProjectFilters["traction"],
    ...dateRange,
  };
}

function LoadingRows() {
  return (
    <div
      className="divide-y divide-border"
      aria-busy="true"
      aria-label="正在加载项目"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(270px,1.9fr)_76px_128px_minmax(220px,1.3fr)_126px_112px_18px]"
        >
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-5 w-52" />
          </div>
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export default function ProjectList() {
  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [filters, setFilters] = useState<ProjectFilters>({});
  const query = trpc.projects.list.useQuery(filters);
  const items = query.data?.items ?? [];
  const stats = query.data?.stats;
  const statsItems = [
    { label: "全部项目", value: stats?.total ?? "..." },
    { label: "待判断", value: stats?.pendingDecision ?? "..." },
    { label: "正在推进", value: stats?.active ?? "..." },
    { label: "进入尽调", value: stats?.dueDiligence ?? "..." },
    {
      label: "信息不足",
      value: stats?.informationGaps ?? "...",
      risk: true,
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main className="app-page">
        <header className="grid gap-6 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pb-7">
          <div className="max-w-3xl">
            <p className="finance-kicker">EARLY-STAGE PIPELINE</p>
            <h1 className="page-heading mt-3">项目工作台</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-muted-foreground">
              管理天使、Pre-A 与 A
              轮项目，围绕商业证据、融资条件和下一步判断推进。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/projects/recycle-bin">
              <Button variant="outline" className="gap-2">
                <Trash2 className="size-4" aria-hidden="true" />
                回收站
              </Button>
            </Link>
            <WorkspaceStatus
              dataUpdatedAt={query.dataUpdatedAt}
              isRefreshing={query.isFetching && !query.isLoading}
            />
          </div>
        </header>

        <section
          className="section-shell grid grid-cols-2 sm:grid-cols-5"
          aria-label="项目概览"
        >
          {statsItems.map(({ label, value, risk }, index) => (
            <div
              key={label}
              className={`relative min-h-24 px-4 py-4 sm:px-5 ${index ? "border-l border-border" : ""} ${index > 1 ? "border-t border-border sm:border-t-0" : ""} ${index === 4 ? "col-span-2 border-l-0 sm:col-span-1 sm:border-l" : ""}`}
            >
              <p className="field-label">{label}</p>
              <p
                className={`finance-number mt-1.5 text-[1.75rem] font-bold ${risk ? "text-destructive" : "text-foreground"}`}
              >
                {value}
              </p>
              {index === 2 ? (
                <span className="absolute inset-x-4 bottom-0 h-0.5 bg-signal" />
              ) : null}
            </div>
          ))}
        </section>

        <div className="mt-5">
          <ProjectFiltersPanel
            value={draft}
            industries={[...INDUSTRY_CATEGORIES]}
            rounds={["天使", "Pre-A", "A"]}
            onChange={setDraft}
            onApply={next => setFilters(toFilters(next))}
            onClear={() => {
              setDraft(emptyDraft);
              setFilters({});
            }}
          />
        </div>

        <section
          className="section-shell mt-5"
          aria-labelledby="deal-list-title"
        >
          <div className="section-bar">
            <div className="flex items-baseline gap-3">
              <h2 id="deal-list-title" className="section-title">
                项目清单
              </h2>
              <p
                className="text-xs font-semibold text-muted-foreground"
                aria-live="polite"
              >
                {query.isLoading ? "正在读取" : `${items.length} 个项目`}
              </p>
            </div>
            {query.isFetching && !query.isLoading && (
              <RefreshCw
                className="size-4 animate-spin text-muted-foreground"
                aria-label="正在刷新"
              />
            )}
          </div>

          <div
            className="hidden grid-cols-[minmax(270px,1.9fr)_76px_128px_minmax(220px,1.3fr)_126px_112px_18px] gap-4 border-b border-border bg-muted/45 px-5 py-2.5 text-[11px] font-bold tracking-[0.025em] text-muted-foreground lg:grid"
            aria-hidden="true"
          >
            <span>项目与行业</span>
            <span>轮次</span>
            <span>管理判断</span>
            <span>商业证据</span>
            <span>融资需求</span>
            <span>更新与共享</span>
            <span />
          </div>

          {query.isLoading ? (
            <LoadingRows />
          ) : query.error ? (
            <div role="alert" className="px-5 py-14 text-center">
              <h2 className="font-bold">无法读取本地项目库</h2>
              <p className="mt-2 text-sm font-medium text-destructive">
                {query.error.message}
              </p>
              <Button
                variant="outline"
                className="mt-5 gap-2"
                onClick={() => query.refetch()}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                重试
              </Button>
            </div>
          ) : items.length ? (
            <div>
              {items.map(project => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="px-5 py-16 text-center">
              <Database
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="mt-4 font-bold">没有匹配的项目</h2>
              <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-muted-foreground">
                可以调整筛选条件，或者导入一份新的 BP。
              </p>
              <Link href="/projects/new">
                <Button className="mt-5 gap-2">
                  <Plus className="size-4" aria-hidden="true" />
                  导入 BP
                </Button>
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
