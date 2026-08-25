import {
  projectStatusLabel,
  type CodexAnalysisClaim,
  type CodexAnalysisRun,
  type CodexInvestmentAnalysisSkill,
  type ProjectDetail,
} from "@shared/bp";
import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileKey2,
  History,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const SKILL_LABELS: Record<CodexInvestmentAnalysisSkill, string> = {
  "review-early-stage-investment": "Cofound 核心初筛",
  "assess-market-first": "市场优先七维",
  "assess-founder-first": "创始人优先",
  "assess-long-term-value": "产业与长期价值",
};

const STATUS_META: Record<
  CodexAnalysisRun["status"],
  { label: string; icon: LucideIcon; className: string }
> = {
  prepared: {
    label: "已准备",
    icon: CircleDashed,
    className: "border-signal/35 bg-signal/5 text-signal",
  },
  completed: {
    label: "已完成",
    icon: CheckCircle2,
    className: "border-foreground bg-foreground text-background",
  },
  stale: {
    label: "已过期",
    icon: History,
    className: "border-border bg-muted text-muted-foreground",
  },
  failed: {
    label: "失败",
    icon: AlertCircle,
    className: "border-destructive/40 bg-destructive/5 text-destructive",
  },
};

const CONFIDENCE_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
} as const;

const ASSESSMENT_LABELS = {
  supportive: "支持",
  mixed: "混合",
  concern: "关注",
  unknown: "未知",
} as const;

function shortHash(value: string) {
  return value ? `${value.slice(0, 12)}…` : "未记录";
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ClaimList({
  title,
  icon: Icon,
  claims,
}: {
  title: string;
  icon: LucideIcon;
  claims: CodexAnalysisClaim[];
}) {
  return (
    <section aria-label={title} className="p-4 sm:p-5">
      <h4 className="flex items-center gap-2 text-xs font-bold">
        <Icon className="size-4 shrink-0 text-signal" aria-hidden="true" />
        {title}
      </h4>
      {claims.length ? (
        <ul className="mt-4 space-y-4">
          {claims.map((claim, index) => (
            <li
              key={`${claim.title}-${index}`}
              className="border-l-2 border-border pl-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-sm font-semibold leading-5">{claim.title}</p>
                <span className="text-[10px] font-bold text-muted-foreground">
                  {claim.basis === "evidence"
                    ? "证据"
                    : claim.basis === "inference"
                      ? "推断"
                      : "信息缺口"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {claim.detail}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          暂无记录。
        </p>
      )}
    </section>
  );
}

function TextList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="p-4 sm:p-5" aria-label={title}>
      <h4 className="text-xs font-bold">{title}</h4>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex items-start gap-2">
              <span
                className="mt-2 size-1 shrink-0 rounded-full bg-foreground"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          暂无记录。
        </p>
      )}
    </section>
  );
}

function FrameworkSections({
  sections,
}: {
  sections: NonNullable<CodexAnalysisRun["result"]>["frameworkSections"];
}) {
  return (
    <section
      className="border-t border-border p-4 sm:p-5"
      aria-label="框架维度"
    >
      <h4 className="text-xs font-bold">框架维度</h4>
      {sections.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {sections.map(section => (
            <article
              key={section.key}
              className="rounded-md border border-border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <h5 className="text-sm font-semibold leading-5">
                  {section.title}
                </h5>
                <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
                  {ASSESSMENT_LABELS[section.assessment]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {section.detail}
              </p>
              {section.counterarguments.length ? (
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    相反解释：
                  </span>
                  {section.counterarguments.join("；")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          这份历史结果尚未记录分框架维度。
        </p>
      )}
    </section>
  );
}

function RunMetadata({ run }: { run: CodexAnalysisRun }) {
  const metadata = [
    ["操作者", run.requestedBy],
    ["创建时间", formatDateTime(run.createdAt)],
    ["完成时间", formatDateTime(run.completedAt)],
    ["模型", run.modelName ?? "尚未记录"],
    [
      "源文件",
      `v${run.projectLocalVersion} · ${shortHash(run.sourceFileSha256)}`,
    ],
    ["事实快照", shortHash(run.factSnapshotHash)],
    ["Skill 版本", run.skillVersion],
    ["提示词版本", run.promptVersion],
  ];

  return (
    <dl className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
      {metadata.map(([label, value], index) => (
        <div
          key={label}
          className={`min-w-0 p-3 sm:p-4 ${
            index > 0 ? "border-t border-border sm:border-t-0" : ""
          } ${index % 2 ? "sm:border-l" : ""} ${index >= 2 ? "sm:border-t" : ""} ${
            index % 4 ? "lg:border-l" : "lg:border-l-0"
          } ${index >= 4 ? "lg:border-t" : "lg:border-t-0"}`}
        >
          <dt className="field-label">{label}</dt>
          <dd
            className="mt-1 truncate font-mono text-[11px] font-medium text-foreground"
            title={value}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AnalysisRun({ run }: { run: CodexAnalysisRun }) {
  const status = STATUS_META[run.status];
  const StatusIcon = status.icon;
  const result = run.result;
  const titleId = `codex-analysis-${run.id}`;

  return (
    <article aria-labelledby={titleId}>
      <header className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="field-label">CODEX INVESTMENT ANALYSIS</p>
          <h3
            id={titleId}
            className="mt-2 text-base font-bold tracking-[-0.02em]"
          >
            {SKILL_LABELS[run.skillName]}
          </h3>
          <p className="mt-1 break-all font-mono text-[10px] font-semibold text-muted-foreground">
            ${run.skillName}
          </p>
        </div>
        <span
          className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${status.className}`}
        >
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {status.label}
        </span>
      </header>

      <RunMetadata run={run} />

      {run.status === "prepared" ? (
        <div
          role="status"
          className="border-t border-border bg-muted/25 p-4 sm:p-5"
        >
          <p className="flex items-start gap-2 text-sm font-semibold">
            <Clock3
              className="mt-0.5 size-4 shrink-0 text-signal"
              aria-hidden="true"
            />
            分析任务已绑定当前事实快照，等待 Codex 执行并回写结果。
          </p>
        </div>
      ) : null}

      {run.status === "failed" ? (
        <div
          role="alert"
          className="border-t border-destructive/25 bg-destructive/5 p-4 sm:p-5"
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-destructive">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            本次分析未完成
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {run.errorDetail ??
              "未记录失败原因，请基于当前事实重新创建分析任务。"}
          </p>
        </div>
      ) : null}

      {run.status === "stale" ? (
        <div
          role="status"
          className="border-t border-border bg-muted/50 p-4 sm:p-5"
        >
          <p className="flex items-start gap-2 text-sm font-semibold">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            这份判断基于旧事实，仅供回溯。
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {run.staleReason ?? "项目事实或原文件版本已经变化，建议重新分析。"}
            {run.staleAt ? ` · ${formatDateTime(run.staleAt)}` : ""}
          </p>
        </div>
      ) : null}

      {result ? (
        <div className="border-t border-border">
          <section className="bg-muted/25 p-4 sm:p-5" aria-label="分析摘要">
            <p className="field-label">结果摘要</p>
            <p className="mt-2 max-w-5xl text-sm leading-6">{result.summary}</p>
          </section>

          <FrameworkSections sections={result.frameworkSections ?? []} />

          <div className="grid border-t border-border lg:grid-cols-2 lg:divide-x lg:divide-border">
            <ClaimList
              title="积极信号"
              icon={Sparkles}
              claims={result.positiveSignals}
            />
            <ClaimList
              title="关键风险"
              icon={TriangleAlert}
              claims={result.keyRisks}
            />
          </div>

          <div className="grid border-t border-border lg:grid-cols-2 lg:divide-x lg:divide-border">
            <TextList title="尚未解决" items={result.unresolvedQuestions} />
            <TextList title="下一步" items={result.nextActions} />
          </div>

          <dl className="grid border-t border-border sm:grid-cols-2">
            <div className="p-4 sm:p-5">
              <dt className="field-label">AI 建议</dt>
              <dd className="mt-2">
                <span className="inline-flex rounded-md border border-foreground/35 bg-card px-2.5 py-1 text-xs font-bold text-foreground">
                  {projectStatusLabel(result.aiSuggestion)}
                </span>
              </dd>
            </div>
            <div className="border-t border-border p-4 sm:border-l sm:border-t-0 sm:p-5">
              <dt className="field-label">置信度</dt>
              <dd className="mt-2 text-sm font-semibold">
                {CONFIDENCE_LABELS[result.confidence]}
              </dd>
            </div>
          </dl>
        </div>
      ) : run.status === "completed" || run.status === "stale" ? (
        <div
          role="alert"
          className="border-t border-border p-4 text-xs text-muted-foreground sm:p-5"
        >
          状态记录存在，但分析结果缺失。
        </div>
      ) : null}
    </article>
  );
}

export function CodexAnalysisHistory({
  analyses,
}: {
  analyses: ProjectDetail["codexAnalyses"];
}) {
  return (
    <section
      className="section-shell"
      aria-labelledby="codex-analysis-history-title"
    >
      <div className="section-bar items-start">
        <div>
          <h2 id="codex-analysis-history-title" className="section-title">
            Codex 分析记录
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted-foreground">
            每次判断绑定源文件与事实快照。AI
            只提供分析建议，不会覆盖负责人设置的管理判断。
          </p>
        </div>
        <ShieldCheck
          className="mt-0.5 size-5 shrink-0 text-signal"
          aria-hidden="true"
        />
      </div>

      {analyses.length ? (
        <ol className="divide-y divide-border">
          {analyses.map(run => (
            <li key={run.id}>
              <AnalysisRun run={run} />
            </li>
          ))}
        </ol>
      ) : (
        <div role="status" className="px-5 py-10 text-center sm:px-8 sm:py-12">
          <FileKey2
            className="mx-auto size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-sm font-bold">还没有 Codex 深度分析记录</h3>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
            完成一次投资分析后，这里会保留所用
            Skill、事实快照、模型与结果，便于复核和追溯。
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Lightbulb className="size-3.5" aria-hidden="true" />
            基础事实分析仍会独立保留
          </p>
        </div>
      )}
    </section>
  );
}
