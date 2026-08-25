import { CollaborationShell } from "@/components/collaboration/CollaborationShell";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { collaborationApi } from "@/lib/collaboration-api";
import {
  auditActionLabel,
  auditTargetLabel,
  collaborationLabel,
  englishStatus,
} from "@/lib/collaboration-labels";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";

const syncTone = {
  synced: "border-foreground/35 text-foreground",
  pending: "border-foreground/35 bg-muted text-foreground",
  conflict: "border-destructive/40 text-destructive",
  error: "border-destructive/40 text-destructive",
};

export default function CollaborationDashboard() {
  const session = useCollaborationSession({ bootstrapAdmin: true });
  const enabled = session.user?.role === "admin";
  const client = useQueryClient();
  const overview = useQuery({
    queryKey: ["collaboration", "overview"],
    queryFn: collaborationApi.overview,
    refetchInterval: 3000,
    enabled,
  });
  const projects = trpc.projects.list.useQuery({}, { enabled });
  const sync = useMutation({
    mutationFn: collaborationApi.syncPublication,
    onSuccess: () => {
      toast.success("同步任务已完成或进入队列");
      client.invalidateQueries({ queryKey: ["collaboration"] });
    },
    onError: error => toast.error(error.message),
  });
  const publications = overview.data?.publications ?? [];
  const publicationByProject = new Map(
    publications.map(item => [item.projectId, item])
  );
  const stats = [
    {
      label: "已发布项目",
      value: publications.filter(item => item.state === "published").length,
      icon: CheckCircle2,
    },
    {
      label: "待审批下载",
      value: overview.data?.pendingApprovals ?? "...",
      icon: Clock3,
    },
    {
      label: "有效协作者",
      value: overview.data?.activeMembers ?? "...",
      icon: Users,
    },
    {
      label: "异常任务",
      value: overview.data?.failedJobs ?? "...",
      icon: AlertTriangle,
    },
  ];
  return (
    <CollaborationShell
      title="团队共享与外部发布"
      description="本地项目只有在管理员明确选择字段、文件和账号后才会生成共享快照。任何浏览、审批和下载都会进入审计记录。"
      actions={
        <Link href="/portal">
          <Button variant="outline" className="gap-2">
            查看共享项目库
            <ExternalLink className="size-4" />
          </Button>
        </Link>
      }
    >
      <section
        className="section-shell grid grid-cols-2 sm:grid-cols-4"
        aria-label="协作概览"
      >
        {stats.map(({ label, value, icon: Icon }, index) => (
          <div
            key={label}
            className={`p-4 sm:p-5 ${index ? "border-l border-border" : ""} ${index > 1 ? "border-t border-border sm:border-t-0" : ""}`}
          >
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
            </p>
            <p className="finance-number mt-2 text-3xl font-semibold">
              {value}
            </p>
          </div>
        ))}
      </section>

      <section className="section-shell mt-5">
        <div className="section-bar">
          <div>
            <h2 className="font-semibold">项目发布边界</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              默认不共享；每个项目独立配置。
            </p>
          </div>
          <span className="mono-meta">逐项目配置</span>
        </div>
        {projects.isLoading || overview.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : projects.error || overview.error ? (
          <div role="alert" className="p-6 text-sm text-destructive">
            {projects.error?.message ?? overview.error?.message}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(projects.data?.items ?? []).map(project => {
              const publication = publicationByProject.get(project.id);
              return (
                <article
                  key={project.id}
                  className="grid gap-4 p-5 transition-colors hover:bg-muted/45 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{project.name}</h3>
                      <StatusBadge
                        status={project.managementStatus}
                        locked={project.statusLocked}
                      />
                      {publication ? (
                        <Badge
                          variant="outline"
                          className={syncTone[publication.syncState]}
                        >
                          {collaborationLabel(publication.state)} |{" "}
                          {collaborationLabel(publication.syncState)}
                        </Badge>
                      ) : (
                        <Badge variant="outline">仅本机</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {[
                        project.industry,
                        project.fundingRound,
                        `本地 v${project.localVersion}`,
                        publication
                          ? `共享 v${publication.remoteVersion}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </p>
                    {publication && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>
                          {publication.selectedFieldCount} 个字段 |{" "}
                          {publication.selectedFileCount} 个文件 |{" "}
                          {publication.memberCount} 个账号 |{" "}
                          {publication.securityMode === "trusted"
                            ? "可信分享"
                            : "高保密"}
                        </p>
                        <p>
                          最近配置：{publication.configuredByName ?? "系统迁移"}
                          {publication.configuredAt
                            ? ` · ${formatDate(publication.configuredAt)}`
                            : ""}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/collaboration/projects/${project.id}`}>
                      <Button
                        size="sm"
                        variant={publication ? "outline" : "default"}
                      >
                        {publication ? "调整权限" : "配置共享"}
                      </Button>
                    </Link>
                    {publication && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => sync.mutate(publication.id)}
                        disabled={sync.isPending}
                      >
                        <RefreshCw
                          className={`size-3.5 ${sync.isPending ? "animate-spin" : ""}`}
                        />
                        同步
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="section-shell p-5">
          <h2 className="font-semibold">最近操作</h2>
          <div className="mt-4 space-y-3">
            {overview.data?.recentAudit.length ? (
              overview.data.recentAudit.map(event => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 text-xs last:border-0"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {auditActionLabel(event.action)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {event.actorName ?? "系统"} |{" "}
                      {auditTargetLabel(event.targetType)}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {englishStatus(event.action)}
                    </p>
                  </div>
                  <time className="shrink-0 text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </time>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">尚无协作操作。</p>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-foreground bg-foreground p-5 text-background">
          <h2 className="font-semibold">共享不会改变本地原件</h2>
          <p className="mt-3 text-sm leading-6 text-background/65">
            系统生成独立共享快照和私有文件副本。后续本地 BP
            更新时，管理员手动或通过 Codex 发起同步；版本冲突不会静默覆盖。
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/collaboration/members">
              <Button
                size="sm"
                variant="outline"
                className="border-white/35 bg-transparent text-white hover:bg-white hover:text-black"
              >
                管理账号
              </Button>
            </Link>
            <Link href="/collaboration/audit">
              <Button
                size="sm"
                variant="ghost"
                className="text-white/70 hover:bg-white/10 hover:text-white"
              >
                查看任务
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </CollaborationShell>
  );
}
