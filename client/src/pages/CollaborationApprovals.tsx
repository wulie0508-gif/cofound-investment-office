import { CollaborationShell } from "@/components/collaboration/CollaborationShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { collaborationApi } from "@/lib/collaboration-api";
import { collaborationLabel } from "@/lib/collaboration-labels";
import { formatDate } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";

export default function CollaborationApprovals() {
  const session = useCollaborationSession({ bootstrapAdmin: true });
  const enabled = session.user?.role === "admin";
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["collaboration", "downloads"],
    queryFn: collaborationApi.adminDownloads,
    refetchInterval: 5000,
    enabled,
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decision = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      collaborationApi.decideDownload(id, approve, notes[id] ?? ""),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["collaboration", "downloads"] });
      toast.success("审批结果已记录");
    },
    onError: error => toast.error(error.message),
  });
  const pending = query.data?.filter(item => item.state === "pending") ?? [];
  const history = query.data?.filter(item => item.state !== "pending") ?? [];
  return (
    <CollaborationShell
      title="下载审批"
      description="外部账号不能直接下载原件。获批后只会得到带身份水印的审阅 PDF，链接 15 分钟且只能使用一次。"
    >
      <section className="rounded-xl border border-border/80 bg-card">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock3 className="size-4 text-amber-300" />
            待处理
          </h2>
          <Badge variant="outline">{pending.length}</Badge>
        </div>
        {pending.length ? (
          <div className="divide-y divide-border/60">
            {pending.map(item => (
              <article
                key={item.id}
                className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_320px]"
              >
                <div>
                  <p className="font-medium">
                    {item.projectName} · {item.fileName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.requesterName} · {item.requesterEmail} ·{" "}
                    {formatDate(item.requestedAt)}
                  </p>
                  <div className="mt-3 rounded-lg bg-background/60 p-3 text-sm leading-6">
                    <span className="text-xs text-muted-foreground">
                      下载用途
                    </span>
                    <p>{item.purpose}</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    审批备注
                    <textarea
                      value={notes[item.id] ?? ""}
                      onChange={e =>
                        setNotes({ ...notes, [item.id]: e.target.value })
                      }
                      className="mt-1 min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground"
                    />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <Button
                      className="flex-1 gap-2"
                      onClick={() =>
                        decision.mutate({ id: item.id, approve: true })
                      }
                    >
                      <CheckCircle2 className="size-4" />
                      批准 24 小时
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() =>
                        decision.mutate({ id: item.id, approve: false })
                      }
                    >
                      <XCircle className="size-4" />
                      拒绝
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <BadgeCheck className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              当前没有待审批申请。
            </p>
          </div>
        )}
      </section>
      {history.length > 0 && (
        <section className="mt-6 rounded-xl border border-border/80 bg-card">
          <div className="border-b border-border/70 px-5 py-4">
            <h2 className="font-semibold">审批记录</h2>
          </div>
          <div className="divide-y divide-border/60">
            {history.map(item => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {item.projectName} · {item.fileName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.requesterName} · {item.reviewerName ?? "系统"} ·{" "}
                    {item.decidedAt ? formatDate(item.decidedAt) : "待处理"}
                  </p>
                  {item.reviewerNote && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      备注：{item.reviewerNote}
                    </p>
                  )}
                </div>
                <Badge variant="outline">
                  {collaborationLabel(item.state)}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </CollaborationShell>
  );
}
