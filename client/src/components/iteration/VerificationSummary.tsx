import { Check, CircleAlert, Clock3 } from "lucide-react";
import type { IterationCheck, IterationResult } from "./iteration-model";

type Copy = (chinese: string, english: string) => string;

function normalizeCheck(check: IterationCheck) {
  const status = check.status?.toLowerCase() ?? "";
  const tone = ["passed", "pass", "ok", "success", "succeeded"].includes(status)
    ? ("passed" as const)
    : ["failed", "fail", "error", "blocked"].includes(status)
      ? ("failed" as const)
      : ("pending" as const);
  return {
    label: check.label,
    detail: check.summary,
    tone,
  };
}

export function VerificationSummary({
  result,
  copy,
}: {
  result: IterationResult;
  copy: Copy;
}) {
  const checks = result.checks.map(normalizeCheck);

  return (
    <section className="border-t border-border" aria-labelledby="checks-title">
      <div className="p-4 sm:p-5">
        <p className="field-label">{copy("本轮结果", "Result")}</p>
        <h3 id="checks-title" className="mt-2 text-sm font-bold">
          {result.summary}
        </h3>

        {result.changes.length ? (
          <div className="mt-4">
            <p className="field-label">{copy("已经调整", "Changes")}</p>
            <ul className="mt-2 space-y-2">
              {result.changes.map((change, index) => (
                <li
                  key={`${change}-${index}`}
                  className="flex items-start gap-2 text-xs leading-5"
                >
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-signal"
                    aria-hidden="true"
                  />
                  {change}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {checks.length ? (
          <div className="mt-4">
            <p className="field-label">{copy("检查结果", "Checks")}</p>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {checks.map((check, index) => {
                const Icon =
                  check.tone === "passed"
                    ? Check
                    : check.tone === "failed"
                      ? CircleAlert
                      : Clock3;
                return (
                  <li
                    key={`${check.label}-${index}`}
                    className="flex items-start gap-3 py-3 text-xs leading-5"
                  >
                    <Icon
                      className={`mt-0.5 size-3.5 shrink-0 ${
                        check.tone === "failed"
                          ? "text-destructive"
                          : check.tone === "passed"
                            ? "text-signal"
                            : "text-muted-foreground"
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-semibold">{check.label}</span>
                      {check.detail ? (
                        <span className="mt-0.5 block text-muted-foreground">
                          {check.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {result.risks.length ? (
          <div className="mt-4 border-l-2 border-destructive/40 pl-3">
            <p className="field-label text-destructive">
              {copy("仍需留意", "Keep in mind")}
            </p>
            <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
              {result.risks.map((risk, index) => (
                <li key={`${risk}-${index}`}>{risk}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {result.previewUrl ? (
          <a
            href={result.previewUrl}
            className="mt-4 inline-flex text-xs font-semibold text-signal hover:underline"
          >
            {copy("查看调整后的页面", "View updated page")}
          </a>
        ) : null}
      </div>
    </section>
  );
}
