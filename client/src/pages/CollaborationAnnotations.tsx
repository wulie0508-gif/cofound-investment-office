import { CollaborationShell } from "@/components/collaboration/CollaborationShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";
import { collaborationApi } from "@/lib/collaboration-api";
import { projectFieldMetadata } from "@shared/field-metadata";
import { useQuery } from "@tanstack/react-query";
import type {
  AnnotationInboxItem,
  PublicationAnnotationSnapshot,
} from "@shared/collaboration";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";

type InboxEntry = AnnotationInboxItem & {
  projectName: string;
  truncated: boolean;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function targetLabel(entry: AnnotationInboxItem) {
  if (entry.fieldKey)
    return `字段 | ${projectFieldMetadata(entry.fieldKey).label}`;
  if (entry.fileName)
    return `文件 | ${entry.fileName}${entry.pageNumber ? ` | 第 ${entry.pageNumber} 页` : ""}`;
  return "整个项目";
}

function flattenSnapshots(snapshots: PublicationAnnotationSnapshot[]) {
  return snapshots
    .flatMap(snapshot =>
      snapshot.annotations.map(annotation => ({
        ...annotation,
        projectName: snapshot.projectName,
        truncated: snapshot.truncated,
      }))
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
}

export default function CollaborationAnnotations() {
  const session = useCollaborationSession({ bootstrapAdmin: true });
  const enabled = session.user?.role === "admin";
  const query = useQuery({
    queryKey: ["collaboration", "annotations"],
    queryFn: collaborationApi.annotationInbox,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled,
  });
  const publications = Array.isArray(query.data?.publications)
    ? query.data.publications
    : [];
  const errors = Array.isArray(query.data?.errors) ? query.data.errors : [];
  const entries = flattenSnapshots(publications);
  const openCount = entries.filter(entry => entry.status === "open").length;
  const truncatedProjects = publications.filter(
    publication => publication.truncated
  );

  return (
    <CollaborationShell
      title="批注收件箱"
      description="从已同步的 Vercel Lite 分享中读取访客批注。页面打开时每 30 秒检查一次，也可以随时手动刷新；同步密钥只在本机服务端使用。"
      actions={
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={!enabled || query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {query.isFetching ? "正在检查" : "立即刷新"}
        </Button>
      }
    >
      <section
        className="section-shell grid grid-cols-3"
        aria-label="批注收件箱概览"
      >
        <div className="p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">已连接分享</p>
          <p className="finance-number mt-2 text-2xl font-semibold sm:text-3xl">
            {query.data ? publications.length : "..."}
          </p>
        </div>
        <div className="border-l border-border p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">全部批注</p>
          <p className="finance-number mt-2 text-2xl font-semibold sm:text-3xl">
            {query.data ? entries.length : "..."}
          </p>
        </div>
        <div className="border-l border-border p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">待处理</p>
          <p className="finance-number mt-2 text-2xl font-semibold sm:text-3xl">
            {query.data ? openCount : "..."}
          </p>
        </div>
      </section>

      <section className="section-shell mt-5" aria-labelledby="inbox-heading">
        <div className="section-bar">
          <div>
            <h2 id="inbox-heading" className="font-semibold">
              最新访客批注
            </h2>
            <p
              className="mt-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {query.data?.fetchedAt
                ? `上次检查 ${formatDateTime(query.data.fetchedAt)}`
                : "正在建立批注回流连接"}
            </p>
          </div>
          <span className="mono-meta">30 秒自动检查</span>
        </div>

        {query.isLoading ? (
          <div className="space-y-3 p-5" aria-busy="true">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : query.error ? (
          <div role="alert" className="flex gap-3 p-6 text-sm text-destructive">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">无法读取远端批注</p>
              <p className="mt-1 text-xs leading-5">{query.error.message}</p>
            </div>
          </div>
        ) : (
          <>
            {errors.length ? (
              <div
                role="alert"
                className="border-b border-destructive/35 bg-destructive/5 px-5 py-4"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  {errors.length} 个分享尚未完成批注回流
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                  {errors.map(error => (
                    <li key={error.publicationId}>
                      {error.projectName} |{" "}
                      {error.message === "接口不存在"
                        ? "远端版本尚未启用批注回流"
                        : error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {truncatedProjects.length ? (
              <p
                role="status"
                className="border-b border-border px-5 py-3 text-xs text-muted-foreground"
              >
                {truncatedProjects
                  .map(project => project.projectName)
                  .join("、")}
                的批注超过 500 条，本页仅显示最近 500 条。
              </p>
            ) : null}

            {entries.length ? (
              <div className="divide-y divide-border">
                {entries.map(entry => (
                  <article
                    key={`${entry.publicationId}:${entry.id}`}
                    className="grid gap-4 px-4 py-5 sm:px-5 lg:grid-cols-[190px_minmax(0,1fr)_auto]"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {entry.projectName}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {entry.fileName ? (
                          <FileText className="size-3.5" aria-hidden="true" />
                        ) : (
                          <MessageSquareText
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        )}
                        <span className="break-words">
                          {targetLabel(entry)}
                        </span>
                      </p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold">
                          {entry.authorName}
                        </p>
                        {entry.parentId ? (
                          <span className="text-xs text-muted-foreground">
                            回复
                          </span>
                        ) : null}
                        <time
                          dateTime={entry.createdAt}
                          className="text-xs text-muted-foreground"
                        >
                          {formatDateTime(entry.createdAt)}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                        {entry.body}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="h-fit w-fit gap-1.5 justify-self-start lg:justify-self-end"
                    >
                      {entry.status === "resolved" ? (
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                      ) : (
                        <Clock3 className="size-3" aria-hidden="true" />
                      )}
                      {entry.status === "resolved" ? "已解决" : "待处理"}
                    </Badge>
                  </article>
                ))}
              </div>
            ) : errors.length && publications.length === 0 ? (
              <div role="status" className="px-5 py-14 text-center">
                <AlertTriangle
                  className="mx-auto size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold">
                  暂时无法确认是否有新批注
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  请先处理上方连接问题，再重新检查收件箱。
                </p>
              </div>
            ) : (
              <div role="status" className="px-5 py-14 text-center">
                <MessageSquareText
                  className="mx-auto size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold">目前没有访客批注</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  新批注会在下一个 30 秒检查周期内出现在这里。
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </CollaborationShell>
  );
}
