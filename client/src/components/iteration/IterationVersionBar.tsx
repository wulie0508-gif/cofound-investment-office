import { Badge } from "@/components/ui/badge";
import { CircleCheck, Sparkles } from "lucide-react";
import type { IterationVersion } from "./iteration-model";

type Copy = (chinese: string, english: string) => string;

export function IterationVersionBar({
  version,
  copy,
}: {
  version: IterationVersion;
  copy: Copy;
}) {
  return (
    <section
      className="section-shell mb-5 grid sm:grid-cols-[1fr_1fr_auto]"
      aria-label={copy("当前版本", "Current version")}
    >
      <div className="px-4 py-3 sm:px-5">
        <p className="field-label">{copy("本机版本", "App version")}</p>
        <p className="finance-number mt-1 text-sm font-bold">
          {version.appVersion || "—"}
        </p>
      </div>
      <div className="border-t border-border px-4 py-3 sm:border-l sm:border-t-0 sm:px-5">
        <p className="field-label">
          {copy("分析能力包", "Analysis capabilities")}
        </p>
        <p className="finance-number mt-1 text-sm font-bold">
          {version.capabilityPackVersion || "—"}
        </p>
      </div>
      <div className="flex items-center border-t border-border px-4 py-3 sm:border-l sm:border-t-0 sm:px-5">
        <Badge variant="outline" className="gap-1.5">
          {version.codexLaunchAvailable ? (
            <CircleCheck className="size-3 text-signal" aria-hidden="true" />
          ) : (
            <Sparkles className="size-3" aria-hidden="true" />
          )}
          {version.codexLaunchAvailable
            ? copy("Codex 可打开", "Codex available")
            : copy("请手动打开 Codex", "Open Codex manually")}
        </Badge>
      </div>
    </section>
  );
}
