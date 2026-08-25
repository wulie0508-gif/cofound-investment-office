import { formatDate, formatFileSize } from "@/lib/format";
import type { ProjectDetail } from "@shared/bp";
import { Download, ExternalLink, FileCheck2, FileWarning } from "lucide-react";

export function VersionTimeline({ project }: { project: ProjectDetail }) {
  return (
    <section className="section-shell p-5" aria-labelledby="versions-title">
      <h2 id="versions-title" className="font-semibold">
        原文件与版本
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        系统为每份文件计算 SHA-256
        内容指纹，用于识别重复文件；内容发生变化时则记录为新的版本。
      </p>
      <ol className="mt-4 space-y-3">
        {project.files.map(file => (
          <li
            key={file.id}
            className="relative rounded-md border border-border bg-muted/25 p-4"
          >
            <div className="flex items-start gap-3">
              {file.extractionStatus === "parsed" ? (
                <FileCheck2 className="mt-0.5 size-5 shrink-0 text-foreground" />
              ) : (
                <FileWarning className="mt-0.5 size-5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="border border-foreground bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-medium text-background">
                    v{file.versionNumber}
                  </span>
                  <p className="min-w-0 truncate text-sm font-medium">
                    {file.originalName}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatFileSize(file.sizeBytes)} | {file.pageCount} 页/段 |{" "}
                  {formatDate(file.createdAt)}
                </p>
                <p
                  className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                  title={file.sha256}
                >
                  SHA-256 {file.sha256}
                </p>
                {file.extractionError && (
                  <p className="mt-2 text-xs leading-5 text-destructive">
                    {file.extractionError}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md p-2 text-muted-foreground hover:bg-signal/10 hover:text-signal"
                  aria-label={`打开 ${file.originalName}`}
                >
                  <ExternalLink className="size-4" />
                </a>
                <a
                  href={file.url}
                  download={file.originalName}
                  className="rounded-md p-2 text-muted-foreground hover:bg-signal/10 hover:text-signal"
                  aria-label={`下载 ${file.originalName}`}
                >
                  <Download className="size-4" />
                </a>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
