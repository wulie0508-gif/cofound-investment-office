import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shareApi } from "@/lib/share-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LinkShareProject } from "@shared/collaboration";
import { projectFieldMetadata } from "@shared/field-metadata";
import {
  CheckCircle2,
  MessageSquarePlus,
  RefreshCw,
  Reply,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Target = "project" | `field:${string}` | `file:${string}`;

function storedIdentity(token: string) {
  try {
    return JSON.parse(
      localStorage.getItem(`cofound-share-person:${token}`) ?? "{}"
    ) as {
      name?: string;
      email?: string;
    };
  } catch {
    return {};
  }
}

export function AnnotationPanel({ project }: { project: LinkShareProject }) {
  const token = project.shareToken;
  const client = useQueryClient();
  const initialIdentity = useMemo(() => storedIdentity(token), [token]);
  const [name, setName] = useState(
    project.viewer?.name ?? initialIdentity.name ?? ""
  );
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<Target>("project");
  const [pageNumber, setPageNumber] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["link-share", token, "annotations"],
    queryFn: () => shareApi.annotations(token),
    initialData: {
      revision: project.revision,
      annotations: project.annotations,
    },
    refetchInterval: 1800,
  });
  const create = useMutation({
    mutationFn: async () => {
      const [kind, value] = target.split(":", 2);
      return shareApi.comment(token, {
        authorName: name,
        authorEmail: project.viewer?.email ?? null,
        body,
        fieldKey: kind === "field" ? value : null,
        fileId: kind === "file" ? value : null,
        pageNumber: kind === "file" && pageNumber ? Number(pageNumber) : null,
        parentId,
      });
    },
    onSuccess: () => {
      if (!project.viewer)
        localStorage.setItem(
          `cofound-share-person:${token}`,
          JSON.stringify({ name })
        );
      setBody("");
      setParentId(null);
      client.invalidateQueries({
        queryKey: ["link-share", token, "annotations"],
      });
      toast.success("批注已同步");
    },
    onError: error => toast.error(error.message),
  });
  const resolve = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      shareApi.resolve(token, id, resolved),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["link-share", token, "annotations"],
      }),
    onError: error => toast.error(error.message),
  });

  return (
    <section
      className="border border-border bg-card"
      aria-labelledby="annotation-panel-title"
    >
      <div className="flex items-start justify-between gap-4 border-b border-foreground px-4 py-4 sm:px-5">
        <div>
          <h2
            id="annotation-panel-title"
            className="text-base font-bold tracking-[-0.02em]"
          >
            协作批注
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Comments. 新批注会自动同步到共享项目。
          </p>
        </div>
        <Badge
          variant="outline"
          className="gap-1 rounded-sm font-mono text-[10px]"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          同步版本 {query.data.revision}
        </Badge>
      </div>

      {project.annotationEnabled && (
        <div className="space-y-4 border-b border-border bg-muted/25 p-4 sm:p-5">
          {project.viewer ? (
            <div className="border border-border bg-card px-3 py-2 text-xs">
              <p className="font-semibold text-foreground">
                {project.viewer.name}，已验证协作者
              </p>
              <p className="mt-1 text-muted-foreground">
                {project.viewer.email}
              </p>
            </div>
          ) : (
            <label
              htmlFor="share-comment-nickname"
              className="block text-xs font-medium text-muted-foreground"
            >
              昵称
              <input
                id="share-comment-nickname"
                value={name}
                onChange={event => setName(event.target.value)}
                className="mt-1.5 h-10 w-full border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/75"
                placeholder="例如：Cassian"
                autoComplete="nickname"
              />
            </label>
          )}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px]">
            <label className="text-xs text-muted-foreground">
              批注位置
              <select
                value={target}
                onChange={event => setTarget(event.target.value as Target)}
                className="mt-1.5 h-10 w-full border border-input bg-card px-3 text-sm text-foreground"
              >
                <option value="project">整个项目</option>
                {project.fields.map(field => (
                  <option key={field.key} value={`field:${field.key}`}>
                    字段：
                    {field.label || projectFieldMetadata(field.key).label}
                  </option>
                ))}
                {project.files.map(file => (
                  <option key={file.id} value={`file:${file.id}`}>
                    文件：{file.originalName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              页码
              <input
                type="number"
                min="1"
                value={pageNumber}
                disabled={!target.startsWith("file:")}
                onChange={event => setPageNumber(event.target.value)}
                className="mt-1.5 h-10 w-full border border-input bg-card px-3 text-sm text-foreground disabled:opacity-50"
              />
            </label>
          </div>
          {parentId && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setParentId(null)}
            >
              正在回复一条批注，取消回复
            </button>
          )}
          <label className="block text-xs text-muted-foreground">
            批注内容
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              rows={3}
              className="mt-1.5 w-full resize-y border border-input bg-card px-3 py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground/75"
              placeholder="写下问题、判断或需要对方补充的内容…"
            />
          </label>
          <Button
            className="h-10 w-full gap-2"
            disabled={
              (!project.viewer && !name.trim()) ||
              !body.trim() ||
              create.isPending
            }
            onClick={() => create.mutate()}
          >
            <MessageSquarePlus className="size-4" aria-hidden="true" />
            {create.isPending ? "正在同步…" : "发布批注"}
          </Button>
        </div>
      )}

      <div className="max-h-[680px] divide-y divide-border overflow-y-auto">
        {query.data.annotations.length ? (
          query.data.annotations.map(annotation => (
            <article key={annotation.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{annotation.authorName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {annotation.fieldKey
                      ? `字段：${projectFieldMetadata(annotation.fieldKey).label}`
                      : annotation.fileId
                        ? `文件${annotation.pageNumber ? `，第 ${annotation.pageNumber} 页` : ""}`
                        : "整个项目"}
                    {annotation.parentId ? "，回复" : ""}
                  </p>
                </div>
                <Badge variant="outline">
                  {annotation.status === "resolved" ? "已解决" : "待处理"}
                </Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                {annotation.body}
              </p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={() => setParentId(annotation.id)}
                >
                  <Reply className="size-3" aria-hidden="true" />
                  回复
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    resolve.mutate({
                      id: annotation.id,
                      resolved: annotation.status !== "resolved",
                    })
                  }
                >
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  {annotation.status === "resolved" ? "重新打开" : "标记解决"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            还没有批注。任何通过此链接查看的人都可以参与同步讨论。
          </div>
        )}
      </div>
    </section>
  );
}
