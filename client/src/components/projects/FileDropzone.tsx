import { Button } from "@/components/ui/button";
import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

const acceptedExtensions = ["pdf", "doc", "docx", "ppt", "pptx", "txt", "md", "markdown"];

export function validateBpFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!acceptedExtensions.includes(extension)) return "仅支持 PDF、Word、PowerPoint、TXT 和 Markdown 文件";
  if (file.size > 50 * 1024 * 1024) return "文件大小不能超过 50MB";
  if (file.size === 0) return "不能导入空文件";
  return null;
}

export function FileDropzone({ file, onFile, disabled = false }: { file: File | null; onFile: (file: File | null) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-6 transition-colors sm:p-8 ${
        dragging ? "border-primary bg-primary/8" : file ? "border-primary/35 bg-primary/5" : "border-border bg-background hover:border-primary/45"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.markdown"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        aria-label="选择 BP 文件"
      />
      {file ? (
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/12">
            <FileText className="size-5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB | 导入后计算 SHA-256</p>
          </div>
          <Button type="button" size="icon" variant="ghost" disabled={disabled} onClick={() => onFile(null)} aria-label="移除所选文件">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="text-center">
          <Upload className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">拖入 BP，或从本机选择</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">PDF / DOCX / PPTX / TXT / MD，最大 50MB</p>
          <Button type="button" variant="outline" className="mt-4" disabled={disabled} onClick={() => inputRef.current?.click()}>
            选择文件
          </Button>
        </div>
      )}
    </div>
  );
}
