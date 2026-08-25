import { Badge } from "@/components/ui/badge";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import type { OperationStatus, OperationType } from "@shared/operation-ledger";
import {
  Activity,
  BrainCircuit,
  Archive,
  CloudDownload,
  CloudUpload,
  FileInput,
  RefreshCw,
  RotateCcw,
  Share2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { InternalOperationItem } from "./internal-storage-model";

const operationIcons: Record<OperationType, LucideIcon> = {
  import: FileInput,
  analysis: BrainCircuit,
  feishu_sync: CloudUpload,
  feishu_inbox_pull: CloudDownload,
  project_archive: Archive,
  project_restore: RotateCcw,
  product_feedback_sync: CloudUpload,
  external_share: Share2,
  app_update: RefreshCw,
  system: Wrench,
};

const operationLabels: Record<OperationType, [string, string]> = {
  import: ["资料导入", "Import"],
  analysis: ["Codex 分析", "Codex analysis"],
  feishu_sync: ["飞书同步", "Feishu sync"],
  feishu_inbox_pull: ["团队收件箱", "Team inbox"],
  project_archive: ["移入回收站", "Move to recycle bin"],
  project_restore: ["恢复项目", "Restore project"],
  product_feedback_sync: ["反馈同步", "Feedback sync"],
  external_share: ["外部分享", "External share"],
  app_update: ["应用更新", "App update"],
  system: ["系统任务", "System task"],
};

const statusLabels: Record<OperationStatus, [string, string]> = {
  started: ["进行中", "Running"],
  succeeded: ["已完成", "Succeeded"],
  failed: ["失败", "Failed"],
  partial: ["部分完成", "Partial"],
  cancelled: ["已取消", "Cancelled"],
};

function statusTone(status: OperationStatus) {
  if (status === "failed") return "border-destructive/40 text-destructive";
  if (status === "started") return "border-signal/35 text-signal";
  if (status === "partial") return "border-foreground/35 bg-muted";
  return "border-border text-muted-foreground";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function OperationLedgerList({
  operations,
}: {
  operations: InternalOperationItem[];
}) {
  const { copy } = useUiLanguage();

  return (
    <section
      className="section-shell mt-5"
      aria-labelledby="operation-ledger-title"
    >
      <div className="section-bar">
        <div>
          <h2 id="operation-ledger-title" className="section-title">
            {copy("运行记录", "Operations ledger")}
          </h2>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {copy(
              "导入、分析、飞书同步与外部分享共用一套可追溯记录。",
              "Imports, analysis, Feishu sync, and external shares use one traceable ledger."
            )}
          </p>
        </div>
        <span className="mono-meta">{operations.length || "—"}</span>
      </div>

      {operations.length ? (
        <div className="divide-y divide-border" role="list">
          {operations.map(operation => {
            const Icon = operationIcons[operation.operationType];
            const [labelZh, labelEn] = operationLabels[operation.operationType];
            const [statusZh, statusEn] = statusLabels[operation.status];
            return (
              <article
                key={operation.id}
                role="listitem"
                className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/45">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold">
                        {copy(labelZh, labelEn)}
                      </h3>
                      <Badge
                        variant="outline"
                        className={statusTone(operation.status)}
                      >
                        {copy(statusZh, statusEn)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                      {operation.projectName ||
                        copy("系统级任务", "System task")}
                      {operation.summary ? ` · ${operation.summary}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pl-11 text-xs font-medium text-muted-foreground sm:justify-end sm:pl-0">
                  <span>{operation.actorName || copy("系统", "System")}</span>
                  <time dateTime={operation.occurredAt} className="font-mono">
                    {formatTime(operation.occurredAt)}
                  </time>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div role="status" className="px-5 py-14 text-center">
          <Activity
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h3 className="mt-4 text-sm font-bold">
            {copy("暂无运行记录", "No operations yet")}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm font-medium leading-6 text-muted-foreground">
            {copy(
              "完成接口接线后，导入、Codex 分析、飞书同步与外部分享的真实结果会按时间出现在这里。",
              "After the data connection is wired, real import, Codex, Feishu, and sharing results will appear here chronologically."
            )}
          </p>
        </div>
      )}
    </section>
  );
}
