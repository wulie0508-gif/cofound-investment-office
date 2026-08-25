import { PortalShell } from "@/components/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { collaborationApi } from "@/lib/collaboration-api";
import { collaborationLabel } from "@/lib/collaboration-labels";
import { formatDate } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileClock } from "lucide-react";
import { toast } from "sonner";

export default function PortalDownloads() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["portal", "downloads"],
    queryFn: collaborationApi.portalDownloads,
    refetchInterval: 5000,
  });
  const link = useMutation({
    mutationFn: collaborationApi.createDownloadLink,
    onSuccess: ({ url, expiresAt }) => {
      toast.success(`一次性链接有效至 ${formatDate(expiresAt)}`);
      client.invalidateQueries({ queryKey: ["portal", "downloads"] });
      window.location.assign(url);
    },
    onError: error => toast.error(error.message),
  });
  return (
    <PortalShell>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Controlled downloads
        </p>
        <h1 className="mt-2 text-2xl font-semibold">下载申请</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          已批准的申请可生成 15 分钟、一次性、登录账号绑定的下载链接。
        </p>
      </header>
      {query.data?.length ? (
        <div className="mt-7 divide-y divide-border/60 rounded-xl border border-border/80 bg-card">
          {query.data.map(item => (
            <article
              key={item.id}
              className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">
                    {item.projectName} · {item.fileName}
                  </h2>
                  <Badge variant="outline">
                    {collaborationLabel(item.state)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  申请于 {formatDate(item.requestedAt)} · 用途：{item.purpose}
                </p>
                {item.reviewerNote && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    审批备注：{item.reviewerNote}
                  </p>
                )}
                {item.expiresAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    审批有效至 {formatDate(item.expiresAt)}
                  </p>
                )}
              </div>
              {item.state === "approved" && (
                <Button
                  className="gap-2"
                  onClick={() => link.mutate(item.id)}
                  disabled={link.isPending}
                >
                  <Download className="size-4" />
                  生成一次性链接
                </Button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-xl border border-dashed border-border p-12 text-center">
          <FileClock className="mx-auto size-9 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">尚无下载申请</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            在具体文件的查看页提交用途说明后，申请会出现在这里。
          </p>
        </div>
      )}
    </PortalShell>
  );
}
