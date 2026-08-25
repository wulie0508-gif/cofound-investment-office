import { MATERIAL_CATEGORY_LABELS, type ProjectDetail } from "@shared/bp";
import { FileArchive, FileText, ExternalLink } from "lucide-react";

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectMaterials({ project }: { project: ProjectDetail }) {
  return (
    <section
      className="section-shell"
      aria-labelledby="project-materials-title"
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <FileArchive className="mt-0.5 size-4 text-signal" aria-hidden="true" />
        <div>
          <h2 id="project-materials-title" className="font-bold">
            项目补充资料
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            与 BP 版本分开保存，不会触发错误的版本号或覆盖初筛结果。
          </p>
        </div>
      </div>
      {project.materials.length ? (
        <ul className="divide-y divide-border">
          {project.materials.map(material => (
            <li key={material.id} className="flex items-center gap-3 px-5 py-4">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {material.originalName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {MATERIAL_CATEGORY_LABELS[material.category]} |{" "}
                  {fileSize(material.sizeBytes)}
                </p>
              </div>
              <a
                href={material.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                查看
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          暂无补充资料。通过微信收件箱接收后会自动出现在这里。
        </p>
      )}
    </section>
  );
}
