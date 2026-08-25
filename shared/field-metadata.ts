export type ProjectFieldMetadata = {
  key: string;
  label: string;
  englishLabel: string;
  group: "company" | "funding" | "traction" | "finance" | "team";
};

const metadata: ProjectFieldMetadata[] = [
  {
    key: "company",
    label: "公司名称",
    englishLabel: "Company",
    group: "company",
  },
  {
    key: "product",
    label: "产品与服务",
    englishLabel: "Product & Service",
    group: "company",
  },
  {
    key: "industry",
    label: "行业分类",
    englishLabel: "Industry",
    group: "company",
  },
  {
    key: "businessModel",
    label: "商业模式",
    englishLabel: "Business Model",
    group: "company",
  },
  {
    key: "fundingRound",
    label: "融资轮次",
    englishLabel: "Funding Round",
    group: "funding",
  },
  {
    key: "fundingAmount",
    label: "融资金额",
    englishLabel: "Funding Amount",
    group: "funding",
  },
  {
    key: "preMoneyValuation",
    label: "投前估值",
    englishLabel: "Pre-money Valuation",
    group: "funding",
  },
  {
    key: "fundingUse",
    label: "资金用途",
    englishLabel: "Use of Proceeds",
    group: "funding",
  },
  {
    key: "orderAmount",
    label: "订单金额",
    englishLabel: "Order Value",
    group: "traction",
  },
  {
    key: "hasLoi",
    label: "LOI / 意向订单",
    englishLabel: "LOI",
    group: "traction",
  },
  {
    key: "revenueAmount",
    label: "营业收入",
    englishLabel: "Revenue",
    group: "traction",
  },
  {
    key: "payingCustomerCount",
    label: "付费客户数",
    englishLabel: "Paying Customers",
    group: "traction",
  },
  {
    key: "customers",
    label: "主要客户",
    englishLabel: "Customers",
    group: "traction",
  },
  {
    key: "customerConcentration",
    label: "第一大客户占比",
    englishLabel: "Top Customer Concentration",
    group: "traction",
  },
  {
    key: "grossMargin",
    label: "毛利率",
    englishLabel: "Gross Margin",
    group: "finance",
  },
  {
    key: "cashBalance",
    label: "账面现金",
    englishLabel: "Cash Balance",
    group: "finance",
  },
  {
    key: "monthlyBurn",
    label: "月度现金消耗",
    englishLabel: "Monthly Burn",
    group: "finance",
  },
  {
    key: "runwayMonths",
    label: "现金跑道",
    englishLabel: "Runway",
    group: "finance",
  },
  { key: "team", label: "核心团队", englishLabel: "Core Team", group: "team" },
];

export const PROJECT_FIELD_METADATA = Object.fromEntries(
  metadata.map(field => [field.key, field])
) as Record<string, ProjectFieldMetadata>;

export const PROJECT_FIELD_GROUPS = {
  company: "公司与产品",
  funding: "融资信息",
  traction: "业务进展",
  finance: "财务质量",
  team: "团队",
} as const;

export function projectFieldMetadata(
  key: string,
  custom?: { label: string } | null
): ProjectFieldMetadata {
  return (
    PROJECT_FIELD_METADATA[key] ?? {
      key,
      label: custom?.label || "自定义字段",
      englishLabel: "Custom Field",
      group: "company",
    }
  );
}
