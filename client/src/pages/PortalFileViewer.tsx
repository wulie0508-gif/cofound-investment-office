import { PortalShell } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";
import { collaborationApi } from "@/lib/collaboration-api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";

export default function PortalFileViewer() {
  const { publicationId = "", fileId = "" } = useParams<{
    publicationId: string;
    fileId: string;
  }>();
  const session = useCollaborationSession();
  const project = useQuery({
    queryKey: ["portal", "project", publicationId],
    queryFn: () => collaborationApi.portalProject(publicationId),
  });
  const file = project.data?.files.find(item => item.id === fileId);
  const [query, setQuery] = useState("");
  const search = useMutation({
    mutationFn: () => collaborationApi.searchFile(publicationId, fileId, query),
    onError: error => toast.error(error.message),
  });
  const pageCount = Math.max(1, file?.pageCount ?? 1);
  const nativePdf =
    file?.securityMode === "trusted" && file.mimeType === "application/pdf";
  const identity = `${session.user?.name ?? "受邀用户"} · ${session.user?.email ?? ""}`;
  return (
    <PortalShell>
      {project.isLoading ? (
        <Skeleton className="h-[720px]" />
      ) : !file ? (
        <div role="alert" className="text-destructive">
          文件不存在或没有权限。
        </div>
      ) : (
        <>
          <div className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <Link
                href={`/portal/projects/${publicationId}`}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                返回项目
              </Link>
              <h1 className="mt-3 break-all text-xl font-semibold">
                {file.originalName}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {file.securityMode === "trusted"
                  ? "可信分享：提示水印 + 原件检索"
                  : "高保密：服务端图像水印 + 独立文本检索"}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="relative min-h-[720px] overflow-hidden rounded-xl border border-border/80 bg-[#d8dddf]">
              {nativePdf ? (
                <>
                  <iframe
                    title={file.originalName}
                    src={`/api/portal/files/${file.id}/original?publicationId=${encodeURIComponent(publicationId)}`}
                    className="h-[78vh] min-h-[720px] w-full bg-white"
                    referrerPolicy="no-referrer"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 18 }).map((_, index) => (
                      <span
                        key={index}
                        className="absolute -rotate-[32deg] whitespace-nowrap text-sm font-semibold text-[#075458]/20"
                        style={{
                          left: `${(index % 3) * 38 - 12}%`,
                          top: `${Math.floor(index / 3) * 18 + 5}%`,
                        }}
                      >
                        {identity}
                        <br />
                        <small>
                          {new Date().toLocaleString("zh-CN", {
                            hour12: false,
                          })}
                        </small>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-4 p-3 sm:p-5">
                  {Array.from({ length: pageCount }).map((_, index) => (
                    <img
                      key={index}
                      loading={index > 1 ? "lazy" : "eager"}
                      src={`/api/portal/files/${file.id}/pages/${index + 1}.png?publicationId=${encodeURIComponent(publicationId)}`}
                      alt={`${file.originalName} 第 ${index + 1} 页，已烧入访问者水印`}
                      className="mx-auto w-full max-w-5xl bg-white shadow-sm"
                    />
                  ))}
                </div>
              )}
            </section>
            <aside className="space-y-5">
              <section className="rounded-xl border border-border/80 bg-card p-4">
                <h2 className="flex items-center gap-2 font-medium">
                  <Search className="size-4 text-primary" />
                  文件内检索
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  高保密模式下，检索来自独立文本索引，不会暴露无水印原件。
                </p>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="订单、收入、客户…"
                    onKeyDown={e => {
                      if (e.key === "Enter" && query.trim()) search.mutate();
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={() => search.mutate()}
                    disabled={!query.trim()}
                    aria-label="搜索"
                  >
                    <Search className="size-4" />
                  </Button>
                </div>
                {search.data && (
                  <div className="mt-4 space-y-2">
                    {search.data.length ? (
                      search.data.map(item => (
                        <div
                          key={`${item.segment}-${item.excerpt}`}
                          className="rounded-lg border border-border/60 p-3"
                        >
                          <p className="text-[11px] text-primary">
                            段落 {item.segment}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            …{item.excerpt}…
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        没有匹配结果。
                      </p>
                    )}
                  </div>
                )}
              </section>
              <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4 text-primary" />
                  访问身份
                </p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {identity}
                </p>
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
                  页面查看和搜索会记录；当前版本不提供下载入口。
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </PortalShell>
  );
}
