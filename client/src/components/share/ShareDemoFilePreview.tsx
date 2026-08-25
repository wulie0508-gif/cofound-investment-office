import { ShareDocumentNavigator } from "@/components/share/ShareDocumentNavigator";
import {
  type DemoShareFile,
  ShareDemoPageCanvas,
} from "@/components/share/ShareDemoPageCanvas";
import { Eye, ShieldCheck } from "lucide-react";
import { useState } from "react";

const DEMO_FILES: DemoShareFile[] = [
  {
    id: "bp-v3",
    originalName: "01｜商业计划书 BP v3.pdf",
    pageCount: 18,
    kind: "bp",
    version: "v3",
    sharedAt: "2026年8月20日",
    meta: "v3 · 18 页 · 商业计划书",
  },
  {
    id: "finance-v2",
    originalName: "02｜三年财务模型 v2.pdf",
    pageCount: 12,
    kind: "finance",
    version: "v2",
    sharedAt: "2026年8月18日",
    meta: "v2 · 12 页 · 财务附件",
  },
  {
    id: "customer-v1",
    originalName: "03｜客户验证材料 v1.pdf",
    pageCount: 9,
    kind: "customer",
    version: "v1",
    sharedAt: "2026年8月16日",
    meta: "v1 · 9 页 · 补充材料",
  },
];

export function ShareDemoFilePreview() {
  const [selectedId, setSelectedId] = useState(DEMO_FILES[0].id);
  const [currentPage, setCurrentPage] = useState(1);
  const selected =
    DEMO_FILES.find(file => file.id === selectedId) ?? DEMO_FILES[0];

  function selectFile(id: string) {
    setSelectedId(id);
    setCurrentPage(1);
  }

  return (
    <section
      className="border border-border bg-card"
      aria-labelledby="demo-file-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-foreground px-4 py-4 sm:px-5">
        <div>
          <h2 id="demo-file-title" className="text-base font-bold">
            原件在线预览
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Original documents · 本次管理员授权 3 份文件
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-[11px] font-semibold">
          <Eye className="size-3.5" aria-hidden="true" />
          仅提供预览
        </span>
      </div>

      <ShareDocumentNavigator
        files={DEMO_FILES}
        selectedId={selected.id}
        currentPage={currentPage}
        pageNavigationEnabled
        onSelect={selectFile}
        onPageChange={setCurrentPage}
      />

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="bg-muted p-3 sm:p-5">
          <ShareDemoPageCanvas file={selected} page={currentPage} />
        </div>

        <aside className="space-y-4 text-sm">
          <div className="border-b border-border pb-4">
            <p className="font-semibold">当前查看版本</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {selected.version} · {selected.pageCount} 页 · {selected.sharedAt}
            </p>
          </div>
          <div className="border-b border-border pb-4">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-signal" aria-hidden="true" />
              查看边界
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              产品不提供下载按钮或下载链接。文件会在浏览器内 inline
              显示；浏览器仍会接收展示所需字节，因此这不是 DRM。
            </p>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            演示页仅呈现虚构页面。正式分享只包含领导在发布端逐项勾选的版本与补充材料。
          </p>
        </aside>
      </div>
    </section>
  );
}
