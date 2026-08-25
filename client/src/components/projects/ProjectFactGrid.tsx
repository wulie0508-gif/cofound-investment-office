import { formatMoney } from "@/lib/format";
import type { EvidenceFact } from "@shared/bp";
import { CircleHelp, FileSearch } from "lucide-react";

const groups: Array<{
  title: string;
  description: string;
  fields: Array<[string, string]>;
}> = [
  {
    title: "公司与产品",
    description: "主体、产品、行业和核心团队",
    fields: [
      ["company", "公司主体"],
      ["product", "产品与服务"],
      ["industry", "行业定位"],
      ["team", "核心团队"],
    ],
  },
  {
    title: "商业验证",
    description: "客户、订单、收入和单位经济性",
    fields: [
      ["businessModel", "商业模式"],
      ["payingCustomerCount", "付费客户数"],
      ["customers", "主要客户"],
      ["customerConcentration", "第一大客户占比"],
      ["orderAmount", "订单金额"],
      ["hasLoi", "LOI / 意向订单"],
      ["revenueAmount", "营业收入"],
      ["grossMargin", "毛利率"],
    ],
  },
  {
    title: "融资与现金",
    description: "定价、现金消耗、股权和资金用途",
    fields: [
      ["fundingRound", "融资轮次"],
      ["fundingAmount", "本轮融资额"],
      ["preMoneyValuation", "投前估值"],
      ["cashBalance", "账面现金"],
      ["monthlyBurn", "月度现金消耗"],
      ["runwayMonths", "现金跑道"],
      ["fundingUse", "资金用途"],
    ],
  },
];

const moneyFields = new Set([
  "fundingAmount",
  "preMoneyValuation",
  "orderAmount",
  "revenueAmount",
  "cashBalance",
  "monthlyBurn",
]);

const ambiguityReasonLabel = {
  multiple_values: "材料中出现多个值",
  missing_unit: "数字缺少单位",
  unknown_currency: "币种不明确",
  cross_page_fragment: "数字跨页断裂",
} as const;

const questionByField: Record<string, string> = {
  company: "签约和融资主体分别是哪家公司？",
  product: "当前真正交付、收费的产品是什么？",
  industry: "公司如何定义所在行业及直接可比对象？",
  team: "核心成员的全职状态、分工和相关经历是什么？",
  businessModel: "谁付费、为什么付费、如何持续收费？",
  payingCustomerCount: "目前有多少家真实付费客户？",
  customers: "主要客户是谁，合同是否可以核验？",
  customerConcentration: "第一大客户贡献了多少收入或订单？",
  orderAmount: "已签署且可核验的订单金额是多少？",
  hasLoi: "是否存在可核验的 LOI 或意向订单？",
  revenueAmount: "已确认收入、回款和开票分别是多少？",
  grossMargin: "当前口径下的毛利率及计算方式是什么？",
  fundingRound: "本轮融资的正式轮次如何定义？",
  fundingAmount: "计划募集多少资金，是否已有意向投资人？",
  preMoneyValuation: "本轮投前估值及其依据是什么？",
  cashBalance: "当前账面可用现金是多少？",
  monthlyBurn: "最近三个月平均月度现金消耗是多少？",
  runwayMonths: "在现有支出水平下还能运营多少个月？",
  fundingUse: "资金将用于增长、研发还是补充营运资金？",
};

function isMissing(fieldKey: string, fact: EvidenceFact | undefined) {
  return (
    !fact ||
    fact.value === null ||
    (fieldKey === "hasLoi" && fact.value === false)
  );
}

function renderValue(key: string, fact: EvidenceFact | undefined) {
  if (!fact || fact.value === null) return "未披露";
  if (key === "hasLoi") return fact.value ? "已披露" : "未披露";
  if (moneyFields.has(key) && typeof fact.value === "number") {
    return formatMoney(fact.value);
  }
  if (
    ["grossMargin", "customerConcentration"].includes(key) &&
    typeof fact.value === "number"
  ) {
    return `${fact.value}%`;
  }
  if (key === "runwayMonths" && typeof fact.value === "number") {
    return `${fact.value} 个月`;
  }
  if (key === "payingCustomerCount" && typeof fact.value === "number") {
    return `${fact.value} 个`;
  }
  return String(fact.value);
}

function FactItem({
  fieldKey,
  label,
  fact,
}: {
  fieldKey: string;
  label: string;
  fact: EvidenceFact;
}) {
  const ambiguous = fact.verificationStatus === "ambiguous";
  return (
    <div
      className={`min-w-0 rounded-md border bg-background px-4 py-3.5 ${ambiguous ? "border-destructive/45" : "border-border"}`}
    >
      <dt className="flex items-center justify-between gap-2 field-label">
        {label}
        {ambiguous ? (
          <span className="rounded-sm border border-destructive/30 bg-destructive/5 px-1.5 py-0.5 text-[9px] font-bold text-destructive">
            口径待确认
          </span>
        ) : null}
      </dt>
      <dd className="mt-1.5 text-[13px] font-bold leading-6 text-foreground">
        {renderValue(fieldKey, fact)}
        {fact.page && fact.quote ? (
          <details className="mt-2 text-[11px] font-medium text-muted-foreground">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 hover:text-foreground">
              <FileSearch className="size-3.5" aria-hidden="true" />第{" "}
              {fact.page} 页证据
            </summary>
            <blockquote className="mt-2 border-l-2 border-signal/45 pl-3 text-[11px] font-medium leading-5">
              {fact.quote}
            </blockquote>
          </details>
        ) : null}
      </dd>
    </div>
  );
}

export function ProjectFactGrid({
  facts,
}: {
  facts: Record<string, EvidenceFact>;
}) {
  const missingFields = groups.flatMap(group =>
    group.fields
      .filter(([fieldKey]) => isMissing(fieldKey, facts[fieldKey]))
      .map(([fieldKey, label]) => ({ fieldKey, label, group: group.title }))
  );
  const ambiguousFields = groups.flatMap(group =>
    group.fields.flatMap(([fieldKey, label]) => {
      const fact = facts[fieldKey];
      return fact?.verificationStatus === "ambiguous"
        ? [{ fieldKey, label, group: group.title, fact }]
        : [];
    })
  );

  return (
    <section className="section-shell" aria-labelledby="facts-title">
      <div className="section-bar items-start">
        <div>
          <h2 id="facts-title" className="section-title">
            事实底稿
          </h2>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
            确定性提取结果，点击页码可回到原文证据。
          </p>
        </div>
        <span className="mono-meta shrink-0">
          {Object.values(facts).filter(fact => fact.value !== null).length}{" "}
          项已披露
        </span>
      </div>

      <div className="divide-y divide-border">
        {groups.map(group => {
          const present = group.fields.filter(
            ([fieldKey]) => !isMissing(fieldKey, facts[fieldKey])
          );
          return (
            <section
              key={group.title}
              className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[170px_minmax(0,1fr)]"
              aria-labelledby={`fact-group-${group.title}`}
            >
              <div>
                <h3
                  id={`fact-group-${group.title}`}
                  className="text-[13px] font-bold"
                >
                  {group.title}
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {group.description}
                </p>
              </div>
              {present.length ? (
                <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {present.map(([fieldKey, label]) => (
                    <FactItem
                      key={fieldKey}
                      fieldKey={fieldKey}
                      label={label}
                      fact={facts[fieldKey]}
                    />
                  ))}
                </dl>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-5 text-[12px] text-muted-foreground">
                  本组暂无可核验信息，已列入尚未解决的问题。
                </p>
              )}
            </section>
          );
        })}
      </div>

      {ambiguousFields.length ? (
        <section
          className="border-t border-border bg-destructive/[0.025] p-4 sm:p-5"
          aria-labelledby="ambiguous-facts-title"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-destructive/30 text-destructive">
              <CircleHelp className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="ambiguous-facts-title" className="section-title">
                待确认的事实口径
              </h3>
              <ul className="mt-4 grid gap-2 md:grid-cols-2">
                {ambiguousFields.map(({ fieldKey, label, group, fact }) => (
                  <li
                    key={fieldKey}
                    className="rounded-md border border-destructive/25 bg-card px-3.5 py-3"
                  >
                    <p className="field-label">
                      {group} / {label}
                    </p>
                    <p className="mt-1.5 text-[12px] font-semibold leading-5">
                      {(fact.ambiguityReasons ?? [])
                        .map(reason => ambiguityReasonLabel[reason])
                        .join("；")}
                    </p>
                    {fact.candidates?.length ? (
                      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                        发现：
                        {fact.candidates
                          .map(candidate =>
                            candidate.page
                              ? `${candidate.raw}（第 ${candidate.page} 页）`
                              : candidate.raw
                          )
                          .join("；")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {missingFields.length ? (
        <section
          className="border-t border-border bg-muted/35 p-4 sm:p-5"
          aria-labelledby="meeting-questions-title"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
              <CircleHelp className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="meeting-questions-title" className="section-title">
                尚未解决的问题
              </h3>
              <ul className="mt-4 grid gap-2 md:grid-cols-2">
                {missingFields.map(({ fieldKey, label, group }) => (
                  <li
                    key={fieldKey}
                    className="rounded-md border border-border bg-card px-3.5 py-3"
                  >
                    <p className="field-label">
                      {group} / {label}
                    </p>
                    <p className="mt-1.5 text-[12px] font-semibold leading-5">
                      {questionByField[fieldKey] ?? `请补充说明${label}。`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
