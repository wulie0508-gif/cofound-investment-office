import { formatMoney } from "@/lib/format";
import {
  PROJECT_FIELD_GROUPS,
  projectFieldMetadata,
  type ProjectFieldMetadata,
} from "@shared/field-metadata";
import type { LinkShareProject } from "@shared/collaboration";

type SharedField = LinkShareProject["fields"][number];
type FieldGroup = ProjectFieldMetadata["group"];

const GROUP_ORDER: FieldGroup[] = [
  "company",
  "funding",
  "traction",
  "finance",
  "team",
];

const GROUP_ENGLISH_LABELS: Record<FieldGroup, string> = {
  company: "Company & Product",
  funding: "Financing",
  traction: "Commercial Traction",
  finance: "Financial Profile",
  team: "Team",
};

const MONEY_FIELDS = new Set([
  "fundingAmount",
  "preMoneyValuation",
  "orderAmount",
  "revenueAmount",
  "cashBalance",
  "monthlyBurn",
]);

export function formatSharedFieldValue(field: SharedField) {
  const { key, value } = field;
  if (value === null || value === undefined || value === "") return "未披露";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") {
    if (MONEY_FIELDS.has(key)) return formatMoney(value);
    if (key === "grossMargin" || key === "customerConcentration")
      return `${value}%`;
    if (key === "runwayMonths") return `${value} 个月`;
    return value.toLocaleString("zh-CN");
  }
  if (Array.isArray(value)) return value.map(String).join("、") || "未披露";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function groupedFields(fields: SharedField[]) {
  return GROUP_ORDER.map(group => ({
    group,
    fields: fields.filter(
      field => projectFieldMetadata(field.key).group === group
    ),
  })).filter(section => section.fields.length > 0);
}

export function ShareInvestmentFacts({
  fields,
}: {
  fields: LinkShareProject["fields"];
}) {
  const sections = groupedFields(fields);

  return (
    <section
      className="border border-border bg-card"
      aria-labelledby="shared-facts-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-foreground px-4 py-4 sm:px-5">
        <div>
          <h2
            id="shared-facts-title"
            className="text-base font-bold tracking-[-0.02em]"
          >
            本次披露要点
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Selected investment facts. 未授权字段不会出现在本页。
          </p>
        </div>
        <span className="border border-border px-2 py-1 font-mono text-[11px] font-semibold">
          已披露 {fields.length} 项
        </span>
      </div>

      {sections.length ? (
        <div className="grid gap-px bg-border md:grid-cols-2">
          {sections.map(({ group, fields: groupFields }, index) => (
            <section
              key={group}
              className={`bg-card px-4 py-5 sm:px-5 ${
                index === sections.length - 1 && sections.length % 2 === 1
                  ? "md:col-span-2"
                  : ""
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold">
                  {PROJECT_FIELD_GROUPS[group]}
                  <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                    {GROUP_ENGLISH_LABELS[group]}
                  </span>
                </h3>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {groupFields.length} 项
                </span>
              </div>
              <div className="mt-4 space-y-5">
                {groupFields.map(field => {
                  const metadata = projectFieldMetadata(field.key);
                  const label = field.label || metadata.label;
                  const englishLabel =
                    field.englishLabel || metadata.englishLabel;
                  return (
                    <div key={field.key}>
                      <h4 className="text-[11px] font-semibold text-muted-foreground">
                        {label}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {englishLabel}
                        </span>
                      </h4>
                      <p className="mt-1 break-words text-[15px] font-semibold leading-6 tabular-nums">
                        {formatSharedFieldValue(field)}
                      </p>
                      {field.evidence?.quote && (
                        <details className="group mt-2 text-xs text-muted-foreground">
                          <summary className="w-fit cursor-pointer select-none underline decoration-border underline-offset-4 hover:text-foreground">
                            查看原件依据
                            {field.evidence.page
                              ? `，第 ${field.evidence.page} 页`
                              : ""}
                          </summary>
                          <blockquote className="mt-2 border-l border-foreground/35 pl-3 text-[11px] leading-5">
                            {field.evidence.quote}
                          </blockquote>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="px-5 py-8 text-sm text-muted-foreground">
          本次分享未披露结构化投资字段。
        </p>
      )}
    </section>
  );
}
