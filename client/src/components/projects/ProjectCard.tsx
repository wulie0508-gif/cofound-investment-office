import { StatusBadge } from "@/components/projects/StatusBadge";
import { formatDateCompact, formatMoney } from "@/lib/format";
import type { ProjectListItem } from "@shared/bp";
import { ArrowUpRight, FileLock2 } from "lucide-react";
import { Link } from "wouter";

function tractionLines(project: ProjectListItem) {
  const lines: string[] = [];
  if (project.revenueAmount)
    lines.push(`收入 ${formatMoney(project.revenueAmount)}`);
  if (project.orderAmount)
    lines.push(`订单 ${formatMoney(project.orderAmount)}`);
  if (project.hasLoi) lines.push("已披露 LOI");
  return lines;
}

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const shareLabel = {
    local_only: "仅本地",
    fields_only: "共享字段",
    selected_files: "共享文件",
  }[project.shareMode];
  const traction = tractionLines(project);
  const operatingMetrics = [
    project.grossMargin !== null ? `毛利 ${project.grossMargin}%` : null,
    project.runwayMonths !== null ? `跑道 ${project.runwayMonths} 个月` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:z-10 sm:px-5 lg:grid-cols-[minmax(270px,1.9fr)_76px_128px_minmax(220px,1.3fr)_126px_112px_18px] lg:items-center lg:gap-4 lg:py-[18px]"
      aria-label={`查看 ${project.name} 项目详情`}
    >
      <span className="absolute inset-y-3 left-0 w-0.5 scale-y-0 bg-signal transition-transform group-hover:scale-y-100" />
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
          <span className="truncate">{project.industry || "行业待归类"}</span>
          <span
            className="font-mono font-medium text-border"
            aria-hidden="true"
          >
            |
          </span>
          <span className="shrink-0 font-mono font-medium">
            v{project.localVersion}
          </span>
        </div>
        <h2 className="truncate text-[15px] font-bold tracking-[-0.016em] text-foreground">
          {project.name}
        </h2>
        <p className="mt-1 truncate text-[13px] font-medium text-muted-foreground">
          {project.product || "产品信息待补充"}
        </p>
        {project.customFields.some(field => field.value !== null) && (
          <p className="mt-1.5 truncate text-[11px] font-semibold text-muted-foreground">
            {project.customFields
              .filter(field => field.value !== null)
              .slice(0, 2)
              .map(field => `${field.label}：${String(field.value)}`)
              .join(" / ")}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <p className="field-label lg:hidden">融资轮次</p>
        <p className="finance-number mt-1 text-[13px] font-bold lg:mt-0">
          {project.fundingRound || "未披露"}
        </p>
      </div>

      <div className="min-w-0">
        <p className="field-label mb-1 lg:hidden">管理判断</p>
        <StatusBadge
          status={project.managementStatus}
          locked={project.statusLocked}
        />
        <p className="mt-1.5 truncate text-[10px] font-semibold text-muted-foreground">
          事实初筛 {project.aiStatus}
        </p>
      </div>

      <div className="col-span-2 border-y border-border/65 py-3 lg:col-span-1 lg:border-0 lg:py-0">
        <p className="field-label lg:hidden">商业证据</p>
        {traction.length ? (
          <div className="mt-1 space-y-0.5 lg:mt-0">
            {traction.slice(0, 2).map(line => (
              <p
                key={line}
                className="finance-number text-[13px] font-bold text-foreground"
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[12px] font-semibold text-destructive lg:mt-0">
            未见订单或收入证据
          </p>
        )}
        {operatingMetrics.length > 0 && (
          <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
            {operatingMetrics.join(" | ")}
          </p>
        )}
      </div>

      <div>
        <p className="field-label lg:hidden">融资需求</p>
        <p className="finance-number mt-1 text-[13px] font-bold lg:mt-0">
          {project.fundingAmount === null
            ? "未披露"
            : formatMoney(project.fundingAmount, project.fundingCurrency)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <div>
          <p className="field-label lg:hidden">更新时间</p>
          <time
            className="mt-1 block text-xs font-semibold text-muted-foreground lg:mt-0"
            dateTime={project.updatedAt}
          >
            {formatDateCompact(project.updatedAt)}
          </time>
        </div>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <FileLock2 className="size-3.5" aria-hidden="true" />
          {shareLabel}
        </span>
      </div>

      <ArrowUpRight
        className="hidden size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal lg:block"
        aria-hidden="true"
      />
    </Link>
  );
}
