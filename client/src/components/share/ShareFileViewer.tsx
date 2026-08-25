import { ShareDocumentNavigator } from "@/components/share/ShareDocumentNavigator";
import type { SharedFile } from "@shared/collaboration";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";

function TextFilePreview({ url }: { url: string }) {
  const [text, setText] = useState("正在读取文件…");
  useEffect(() => {
    let active = true;
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then(value => {
        if (active) setText(value);
      })
      .catch(error => {
        if (active) setText(`文件读取失败：${String(error)}`);
      });
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <pre className="max-h-[72vh] min-h-[420px] overflow-auto whitespace-pre-wrap break-words bg-card p-5 font-mono text-xs leading-6 text-foreground/90 sm:min-h-[520px]">
      {text}
    </pre>
  );
}

export function ShareFileViewer({ files }: { files: SharedFile[] }) {
  const [selectedId, setSelectedId] = useState(files[0]?.id ?? "");
  const [currentPage, setCurrentPage] = useState(1);
  const selected = files.find(file => file.id === selectedId) ?? files[0];

  function selectFile(id: string) {
    setSelectedId(id);
    setCurrentPage(1);
  }

  if (!selected)
    return (
      <section className="border border-border bg-card p-6">
        <h2 className="font-semibold">源文件</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          当前分享没有包含文件。
        </p>
      </section>
    );

  const source = `${selected.viewerUrl}#page=${currentPage}&toolbar=0&navpanes=0&scrollbar=1`;
  return (
    <section className="overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-foreground px-4 py-4 sm:px-5">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-base font-bold tracking-[-0.02em]">
            <FileText className="size-4 text-foreground" aria-hidden="true" />
            原件审阅
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            文件会传输到浏览器以完成在线预览。本产品不提供下载按钮，但这不等同于
            DRM 或技术防复制，请按分享约定使用材料。
          </p>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          已授权 {files.length} 份
        </span>
      </div>
      <ShareDocumentNavigator
        files={files}
        selectedId={selected.id}
        currentPage={currentPage}
        pageNavigationEnabled={selected.mimeType === "application/pdf"}
        onSelect={selectFile}
        onPageChange={setCurrentPage}
      />
      {selected.mimeType.startsWith("image/") ? (
        <div className="max-h-[760px] overflow-auto bg-white p-4">
          <img
            src={selected.viewerUrl}
            alt={selected.originalName}
            className="mx-auto max-w-full"
          />
        </div>
      ) : selected.mimeType === "application/pdf" ? (
        <iframe
          key={`${selected.id}:${currentPage}`}
          title={`${selected.originalName} 在线查看`}
          src={source}
          className="h-[70vh] min-h-[420px] w-full bg-white sm:min-h-[520px]"
        />
      ) : selected.mimeType.startsWith("text/") ||
        /\.(?:md|markdown|txt|csv|json)$/iu.test(selected.originalName) ? (
        <TextFilePreview url={selected.viewerUrl} />
      ) : (
        <div className="flex min-h-80 items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <FileText
              className="mx-auto size-8 text-primary"
              aria-hidden="true"
            />
            <p className="mt-4 text-sm font-medium">该格式需要转换后在线预览</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              为避免浏览器自动下载，本页面不会直接打开此格式。建议共享 PDF
              版本。
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
