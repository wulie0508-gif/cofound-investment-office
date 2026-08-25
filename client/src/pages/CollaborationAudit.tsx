import { CollaborationShell } from "@/components/collaboration/CollaborationShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { collaborationApi } from "@/lib/collaboration-api";
import {
  auditActionLabel,
  auditTargetLabel,
  collaborationLabel,
  englishStatus,
} from "@/lib/collaboration-labels";
import { formatDate } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";

export default function CollaborationAudit() {
  const session = useCollaborationSession({ bootstrapAdmin: true });
  const enabled = session.user?.role === "admin";
  const client = useQueryClient();
  const jobs = useQuery({
    queryKey: ["collaboration", "jobs"],
    queryFn: collaborationApi.jobs,
    refetchInterval: 3000,
    enabled,
  });
  const audit = useQuery({
    queryKey: ["collaboration", "audit"],
    queryFn: collaborationApi.audit,
    refetchInterval: 5000,
    enabled,
  });
  const retry = useMutation({
    mutationFn: collaborationApi.retryJob,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["collaboration", "jobs"] });
      toast.success("任务已重新入队");
    },
    onError: error => toast.error(error.message),
  });
  return (
    <CollaborationShell
      title="任务与审计"
      description="同步、自动核实、访问、浏览、审批和下载都有可追踪记录；失败任务不会无限卡住，可以明确重试。"
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-border/80 bg-card">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="size-4 text-primary" />
              异步任务
            </h2>
            <span className="text-xs text-muted-foreground">
              待处理 · 执行中 · 已完成 · 失败
            </span>
          </div>
          <div className="max-h-[620px] divide-y divide-border/60 overflow-y-auto">
            {jobs.data?.map(job => (
              <div key={job.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {collaborationLabel(job.kind)}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {englishStatus(job.kind)}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {job.id}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      job.state === "succeeded"
                        ? "border-primary/30 text-primary"
                        : job.state === "failed" || job.state === "conflict"
                          ? "border-destructive/40 text-destructive"
                          : ""
                    }
                  >
                    {collaborationLabel(job.state)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  尝试 {job.attempts}/{job.maxAttempts} ·{" "}
                  {formatDate(job.createdAt)}
                </p>
                {job.error && (
                  <p
                    role="alert"
                    className="mt-2 rounded bg-destructive/5 p-2 text-xs text-destructive"
                  >
                    {job.error}
                  </p>
                )}
                {["failed", "conflict"].includes(job.state) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-2"
                    onClick={() => retry.mutate(job.id)}
                  >
                    <RefreshCw className="size-3.5" />
                    重试
                  </Button>
                )}
              </div>
            )) ?? (
              <div className="p-8 text-sm text-muted-foreground">
                尚无任务。
              </div>
            )}
          </div>
        </section>
        <section className="rounded-xl border border-border/80 bg-card">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <ScrollText className="size-4 text-primary" />
              审计事件
            </h2>
            <span className="text-xs text-muted-foreground">
              最近 {audit.data?.length ?? 0} 条
            </span>
          </div>
          <div className="max-h-[620px] divide-y divide-border/60 overflow-y-auto">
            {audit.data?.map(event => (
              <div key={event.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {auditActionLabel(event.action)}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {englishStatus(event.action)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actorName ?? "系统"}
                      {event.actorEmail ? ` · ${event.actorEmail}` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </time>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {auditTargetLabel(event.targetType)}
                  {event.targetId ? ` · ${event.targetId}` : ""}
                  {event.ip ? ` · ${event.ip}` : ""}
                </p>
              </div>
            )) ?? (
              <div className="p-8 text-sm text-muted-foreground">
                尚无审计事件。
              </div>
            )}
          </div>
        </section>
      </div>
    </CollaborationShell>
  );
}
