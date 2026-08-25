import type { AnalysisPayload, OptimizationRecommendation } from "@shared/bp";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  SearchCheck,
} from "lucide-react";

const checkIcon = {
  pass: CheckCircle2,
  attention: AlertTriangle,
  unknown: CircleHelp,
};

const checkLabel = { pass: "相对清晰", attention: "需核实", unknown: "未披露" };

export function AnalysisReview({
  analysis,
  recommendations,
}: {
  analysis: AnalysisPayload;
  recommendations: OptimizationRecommendation[];
}) {
  return (
    <div className="space-y-5">
      <section
        className="rounded-lg border border-foreground bg-foreground p-5 text-background sm:p-6"
        aria-labelledby="analysis-title"
      >
        <div className="flex items-start gap-3">
          <SearchCheck
            className="mt-0.5 size-5 shrink-0 text-background"
            aria-hidden="true"
          />
          <div>
            <h2 id="analysis-title" className="text-[15px] font-bold">
              规则初筛摘要
            </h2>
            <p className="mt-2 text-sm leading-6 text-background/70">
              {analysis.summary.replaceAll(" · ", " / ")}
            </p>
            <p className="mt-4 font-mono text-[10px] text-background/70">
              {analysis.engine} | Schema {analysis.schemaVersion}
            </p>
          </div>
        </div>
      </section>

      <section className="section-shell" aria-labelledby="checks-title">
        <div className="section-bar">
          <h2 id="checks-title" className="section-title">
            基础商业逻辑检查
          </h2>
          <span className="mono-meta">
            {analysis.commercialChecks.length} 项
          </span>
        </div>
        <div className="grid md:grid-cols-2">
          {analysis.commercialChecks.map(check => {
            const Icon = checkIcon[check.result];
            return (
              <div
                key={check.name}
                className="border-b border-border p-4 last:border-b-0 md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0 sm:p-5"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon
                    className={`size-4 ${check.result === "attention" ? "text-destructive" : "text-foreground"}`}
                    aria-hidden="true"
                  />
                  {check.name}
                  <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {checkLabel[check.result]}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {check.detail}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="section-shell grid grid-cols-1 lg:grid-cols-2"
        aria-label="风险与缺失信息"
      >
        <div className="p-5 lg:border-r lg:border-border">
          <h2 className="flex items-center gap-2 text-[13px] font-bold">
            <AlertTriangle className="size-4 text-destructive" />
            风险
          </h2>
          {analysis.risks.length ? (
            <ul className="mt-4 space-y-3">
              {analysis.risks.map((risk, index) => (
                <li
                  key={`${risk.title}-${index}`}
                  className="border-l-2 border-border pl-3"
                >
                  <p className="text-sm font-medium">
                    {risk.title}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      /{" "}
                      {risk.basis === "explicit"
                        ? "原文"
                        : risk.basis === "derived"
                          ? "推导"
                          : "信息缺失"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {risk.detail}
                  </p>
                  {risk.evidencePages.length > 0 && (
                    <p className="mt-1 text-[11px] text-signal">
                      证据页/段：{risk.evidencePages.join("、")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              当前规则未发现明确风险；不代表不存在风险。
            </p>
          )}
        </div>
        <div className="border-t border-border p-5 lg:border-t-0">
          <h2 className="flex items-center gap-2 text-[13px] font-bold">
            <CircleHelp className="size-4 text-muted-foreground" />
            缺失信息
          </h2>
          {analysis.missingInformation.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {analysis.missingInformation.map(item => (
                <li
                  key={item}
                  className="rounded-sm border border-border bg-muted/70 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground"
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              核心字段均已在材料中找到，但仍需人工核验。
            </p>
          )}
        </div>
      </section>

      <section
        className="section-shell"
        aria-labelledby="recommendations-title"
      >
        <div className="section-bar items-start">
          <div>
            <h2
              id="recommendations-title"
              className="flex items-center gap-2 section-title"
            >
              <Lightbulb className="size-4 text-signal" />
              BP 优化建议
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              独立于原始事实保存，不覆盖 BP 内容。
            </p>
          </div>
        </div>
        {recommendations.length ? (
          <ol className="grid md:grid-cols-2">
            {recommendations.map((item, index) => (
              <li
                key={`${item.section}-${index}`}
                className="border-b border-border p-4 last:border-b-0 md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0 sm:p-5"
              >
                <p className="font-mono text-[10px] font-bold tracking-wide text-signal">
                  {item.section}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {item.recommendation}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.reason}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">暂无规则建议。</p>
        )}
      </section>
    </div>
  );
}
