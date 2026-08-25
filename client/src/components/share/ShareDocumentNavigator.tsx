import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
} from "lucide-react";
import { KeyboardEvent, useEffect, useState } from "react";

export type NavigableShareFile = {
  id: string;
  originalName: string;
  pageCount: number;
  meta?: string;
};

function clampPage(value: number, pageCount: number) {
  return Math.min(Math.max(Math.trunc(value) || 1, 1), Math.max(pageCount, 1));
}

export function ShareDocumentNavigator({
  files,
  selectedId,
  currentPage,
  pageNavigationEnabled,
  onSelect,
  onPageChange,
}: {
  files: NavigableShareFile[];
  selectedId: string;
  currentPage: number;
  pageNavigationEnabled: boolean;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
}) {
  const selected = files.find(file => file.id === selectedId) ?? files[0];
  const pageCount = Math.max(selected?.pageCount ?? 1, 1);
  const [draftPage, setDraftPage] = useState(String(currentPage));

  useEffect(() => setDraftPage(String(currentPage)), [currentPage, selectedId]);

  function commitPage(value = draftPage) {
    const page = clampPage(Number(value), pageCount);
    setDraftPage(String(page));
    onPageChange(page);
  }

  function handlePageKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitPage(event.currentTarget.value);
      event.currentTarget.select();
    }
  }

  if (!selected) return null;

  return (
    <div className="border-b border-border">
      {files.length > 1 ? (
        <nav
          className="grid gap-2 border-b border-border bg-muted/35 p-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="本次共享文件"
        >
          {files.map((file, index) => {
            const active = file.id === selected.id;
            return (
              <button
                key={file.id}
                type="button"
                aria-pressed={active}
                className={`selection-tile flex min-w-0 items-start gap-3 p-3 text-left ${active ? "selection-tile-active" : ""}`}
                onClick={() => onSelect(file.id)}
              >
                <span className="font-mono text-[10px] font-bold text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">
                    {file.originalName}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {file.meta ?? `${file.pageCount} 页/段`}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/45 px-4 py-2.5 sm:px-5">
        <span className="inline-flex min-w-0 items-center gap-2 text-[11px]">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate font-medium">{selected.originalName}</span>
          <span className="shrink-0 text-muted-foreground">
            {files.length > 1
              ? `${files.findIndex(file => file.id === selected.id) + 1} / ${files.length} 份`
              : "1 份"}
          </span>
        </span>

        {pageNavigationEnabled ? (
          <div
            className="flex items-center gap-1"
            aria-label={`${selected.originalName} 页码导航`}
          >
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="跳到第一页"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(1)}
            >
              <ChevronsLeft className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="上一页"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </Button>
            <label className="mx-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="sr-only">跳转页码</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={draftPage}
                onChange={event => setDraftPage(event.target.value)}
                onBlur={event => commitPage(event.currentTarget.value)}
                onKeyDown={handlePageKeyDown}
                className="h-8 w-12 rounded-md border border-input bg-background px-1 text-center font-mono text-xs font-semibold text-foreground"
                aria-label="跳转页码"
              />
              <span className="font-mono tabular-nums">/ {pageCount}</span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="下一页"
              disabled={currentPage >= pageCount}
              onClick={() => onPageChange(currentPage + 1)}
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="跳到最后一页"
              disabled={currentPage >= pageCount}
              onClick={() => onPageChange(pageCount)}
            >
              <ChevronsRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">
            {selected.pageCount} 页/段
          </span>
        )}
      </div>
    </div>
  );
}
