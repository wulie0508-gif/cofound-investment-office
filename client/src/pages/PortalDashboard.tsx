import { PortalShell } from "@/components/portal/PortalShell";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { collaborationApi } from "@/lib/collaboration-api";
import { formatDate } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Files, LockKeyhole, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export default function PortalDashboard() {
  const query = useQuery({
    queryKey: ["portal", "projects"],
    queryFn: collaborationApi.portalProjects,
  });
  const [search, setSearch] = useState("");
  const projects = (query.data ?? []).filter(project =>
    `${project.name} ${project.product ?? ""} ${project.industry ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  );
  return (
    <PortalShell>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Authorized projects
          </p>
          <h1 className="mt-2 text-2xl font-semibold">企业共享项目</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            这里仅显示管理员明确授权给当前账号的内容。
          </p>
        </div>
        <label className="relative block sm:w-72">
          <span className="sr-only">搜索共享项目</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="公司、行业、产品"
            className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm"
          />
        </label>
      </header>
      {query.isLoading ? (
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : query.error ? (
        <div
          role="alert"
          className="mt-7 rounded-xl border border-destructive/40 p-6 text-sm text-destructive"
        >
          {query.error.message}
        </div>
      ) : projects.length ? (
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {projects.map(project => (
            <Link
              key={project.publicationId}
              href={`/portal/projects/${project.publicationId}`}
              className="group rounded-xl border border-border/80 bg-card p-5 transition-colors hover:border-primary/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={project.status} />
                    <Badge variant="outline">
                      {project.securityMode === "trusted"
                        ? "可信分享"
                        : "高保密"}
                    </Badge>
                  </div>
                  <h2 className="mt-4 truncate text-lg font-semibold group-hover:text-primary">
                    {project.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[project.industry, project.fundingRound, project.product]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>
              {project.summary && (
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {project.summary}
                </p>
              )}
              <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-4 text-xs text-muted-foreground">
                <span>
                  {project.fields.length} 个字段 · {project.files.length} 个文件
                </span>
                <span>
                  {project.publishedAt
                    ? formatDate(project.publishedAt)
                    : "待发布"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-xl border border-dashed border-border p-12 text-center">
          <Files className="mx-auto size-9 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">暂无可查看项目</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            账号已登录，但管理员尚未为你分配共享项目。
          </p>
        </div>
      )}
      <div className="mt-8 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-5 text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          共享项目库不是公共页面。账号、项目、字段和文件四层权限都会由服务端校验；截图或通过其他设备拍摄无法被技术上完全阻止，请遵守保密约定。
        </p>
      </div>
    </PortalShell>
  );
}
