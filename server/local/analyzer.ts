import type {
  AnalysisStatus,
  AnalysisItem,
  AnalysisPayload,
  CommercialCheck,
  EvidenceFact,
  FactAmbiguityReason,
  FactCandidate,
  OptimizationRecommendation,
} from "../../shared/bp";

export type ParsedPage = { page: number; text: string };
export type ParsedDocument = { pages: ParsedPage[]; text: string };

const missingFact = (): EvidenceFact => ({
  value: null,
  raw: null,
  page: null,
  quote: null,
  confidence: 0,
  verificationStatus: "missing",
  ambiguityReasons: [],
  candidates: [],
});

function clean(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[*_`]+|[*_`]+$/g, "")
    .trim();
}

type FactMatchOptions = {
  kind?: "money";
  crossPageLabel?: RegExp;
};

function collectPatternMatches(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = globalPattern.exec(text))) {
    matches.push(match);
    if (match[0].length === 0) globalPattern.lastIndex += 1;
  }
  return matches;
}

function normalizedCandidateValue(value: FactCandidate["value"]) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .toLocaleLowerCase("zh-CN")
        .replace(/\s+/gu, " ")
        .trim()
    : String(value);
}

function moneyAmbiguityReasons(raw: string): FactAmbiguityReason[] {
  const reasons: FactAmbiguityReason[] = [];
  const hasUnit =
    /(?:亿|千万|百万|万|元|美元|欧元|英镑|cny|rmb|usd|eur|gbp|[$¥￥€£]|\b[mkb]\b)/iu.test(
      raw
    );
  const hasCurrency =
    /(?:人民币|元|cny|rmb|美元|usd|欧元|eur|英镑|gbp|[$¥￥€£])/iu.test(raw);
  if (!hasUnit) reasons.push("missing_unit");
  if (!hasCurrency) reasons.push("unknown_currency");
  return reasons;
}

function crossPageCandidate(
  pages: ParsedPage[],
  label: RegExp,
  parse: (value: string) => string | number | boolean | null
) {
  for (let index = 0; index < pages.length - 1; index += 1) {
    const current = pages[index];
    const next = pages[index + 1];
    const tail = current.text.slice(-120);
    const localLabel = new RegExp(label.source, label.flags.replace("g", ""));
    if (!localLabel.test(tail) || !/[:：]\s*$/u.test(tail)) continue;
    const raw = clean(next.text.slice(0, 80).split(/[\n。；;]/u, 1)[0] ?? "");
    if (!raw) continue;
    const value = parse(raw);
    if (value === null || value === "") continue;
    return {
      value,
      raw,
      page: next.page,
      quote: clean(`${tail.slice(-60)} [跨页] ${raw}`).slice(0, 180),
    } satisfies FactCandidate;
  }
  return null;
}

function factFromMatch(
  pages: ParsedPage[],
  patterns: RegExp[],
  parse: (value: string) => string | number | boolean | null = value =>
    clean(value),
  options: FactMatchOptions = {}
): EvidenceFact {
  const candidates: FactCandidate[] = [];
  for (const page of pages) {
    for (const pattern of patterns) {
      for (const match of collectPatternMatches(page.text, pattern)) {
        const raw = clean(match[1] ?? match[0]);
        const value = parse(raw);
        if (value === null || value === "") continue;
        candidates.push({
          value,
          raw,
          page: page.page,
          quote: clean(match[0]).slice(0, 180),
        });
      }
    }
  }
  const crossPage = options.crossPageLabel
    ? crossPageCandidate(pages, options.crossPageLabel, parse)
    : null;
  if (crossPage) candidates.push(crossPage);
  if (candidates.length === 0) return missingFact();

  const uniqueValues = new Set(
    candidates.map(candidate => normalizedCandidateValue(candidate.value))
  );
  const reasons: FactAmbiguityReason[] = [];
  if (uniqueValues.size > 1) reasons.push("multiple_values");
  if (crossPage) reasons.push("cross_page_fragment");
  if (options.kind === "money")
    for (const candidate of candidates)
      for (const reason of moneyAmbiguityReasons(candidate.raw))
        if (!reasons.includes(reason)) reasons.push(reason);

  const chosen = candidates[0];
  const ambiguous = reasons.length > 0;
  return {
    ...chosen,
    confidence: ambiguous ? 0.55 : 0.9,
    verificationStatus: ambiguous ? "ambiguous" : "confirmed",
    ambiguityReasons: reasons,
    candidates,
  };
}

function booleanFact(pages: ParsedPage[], pattern: RegExp): EvidenceFact {
  for (const page of pages) {
    const match = pattern.exec(page.text);
    if (!match) continue;
    const start = Math.max(0, match.index - 45);
    const end = Math.min(page.text.length, match.index + match[0].length + 90);
    return {
      value: true,
      raw: match[0],
      page: page.page,
      quote: clean(page.text.slice(start, end)).slice(0, 180),
      confidence: 0.86,
      verificationStatus: "confirmed",
      ambiguityReasons: [],
      candidates: [
        {
          value: true,
          raw: match[0],
          page: page.page,
          quote: clean(page.text.slice(start, end)).slice(0, 180),
        },
      ],
    };
  }
  return { ...missingFact(), value: false, confidence: 0.7 };
}

export function parseMoney(value: string): number | null {
  const normalized = value.replace(/[,，\s￥¥$]/g, "");
  const match = normalized.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  let number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  if (/亿/.test(normalized)) number *= 100_000_000;
  else if (/千万/.test(normalized)) number *= 10_000_000;
  else if (/百万/.test(normalized)) number *= 1_000_000;
  else if (/万/.test(normalized)) number *= 10_000;
  else if (/[bB](?:CNY|RMB|USD|EUR|GBP)?$/u.test(normalized))
    number *= 1_000_000_000;
  else if (/[mM](?:CNY|RMB|USD|EUR|GBP)?$/u.test(normalized))
    number *= 1_000_000;
  else if (/[kK](?:CNY|RMB|USD|EUR|GBP)?$/u.test(normalized)) number *= 1_000;
  return number;
}

function parsePercent(value: string) {
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function parseMonths(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:个)?月/);
  return match ? Number(match[1]) : null;
}

function parseCount(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

const fieldLabels: Record<string, string> = {
  company: "公司名称",
  product: "产品与服务",
  industry: "行业",
  fundingRound: "融资轮次",
  fundingAmount: "融资额",
  preMoneyValuation: "投前估值",
  orderAmount: "订单金额",
  hasLoi: "LOI/意向订单",
  revenueAmount: "收入",
  payingCustomerCount: "付费客户数",
  customers: "客户",
  customerConcentration: "第一大客户占比",
  grossMargin: "毛利率",
  cashBalance: "账面现金",
  monthlyBurn: "月度现金消耗",
  runwayMonths: "现金跑道",
  team: "团队",
  businessModel: "商业模式",
  fundingUse: "资金用途",
};

function trustedValue(facts: Record<string, EvidenceFact>, key: string) {
  const fact = facts[key];
  return fact?.verificationStatus === "ambiguous"
    ? null
    : (fact?.value ?? null);
}

function extractFacts(document: ParsedDocument): Record<string, EvidenceFact> {
  const pages = document.pages;
  const line = "([^\\n。；;]{1,100})";
  return {
    company: factFromMatch(pages, [
      new RegExp(`(?:公司名称|项目主体|企业名称)\\s*[:：]\\s*${line}`, "i"),
      new RegExp(`(?:项目名称)\\s*[:：]\\s*${line}`, "i"),
      /(?:虚构)?公司全称\s*[:：]\s*\*{0,2}([^\n。；;]{1,100})/iu,
    ]),
    product: factFromMatch(pages, [
      new RegExp(
        `(?:核心产品|产品(?:与服务)?|解决方案)\\s*[:：]\\s*${line}`,
        "i"
      ),
      /(?:虚构)?产品\s*[:：]\s*\*{0,2}([^\n。；;]{1,100})/iu,
    ]),
    industry: factFromMatch(pages, [
      new RegExp(`(?:所属行业|行业|赛道)\\s*[:：]\\s*${line}`, "i"),
    ]),
    fundingRound: factFromMatch(
      pages,
      [
        /(?:融资轮次|本轮轮次|轮次)\s*[:：]\s*([^\n。；;]{1,30})/i,
        /项目阶段\s*[:：]\s*\*{0,2}([^\n。；;]{1,30})/iu,
      ],
      value => clean(value).replace(/轮$/, "")
    ),
    fundingAmount: factFromMatch(
      pages,
      [
        /(?:融资(?:金额|需求|目标)|本轮计划融资)\s*[:：]\s*([^\n。；;]{1,40})/i,
        /(?:本轮融资金额|本轮计划融资)(?:（[^）\n]{1,30}）)?\s*(?:为|[:：])\s*\*{0,2}\s*((?:人民币|CNY|RMB|¥|￥|\$)?\s*[\d,.]+\s*(?:亿元|千万(?:元)?|百万(?:元)?|万元|元|[KMBkmb])(?:\s*(?:人民币|CNY|RMB|USD|美元))?)/iu,
      ],
      parseMoney,
      {
        kind: "money",
        crossPageLabel: /(?:融资(?:金额|需求|目标)|本轮计划融资)/iu,
      }
    ),
    preMoneyValuation: factFromMatch(
      pages,
      [
        /(?:投前估值|Pre[- ]?money(?: Valuation)?|本轮投前)\s*[:：]\s*([^\n。；;]{1,40})/i,
        /投前估值(?:主张)?\s*(?:为|[:：])\s*\*{0,2}\s*((?:人民币|CNY|RMB|¥|￥|\$)?\s*[\d,.]+\s*(?:亿元|千万(?:元)?|百万(?:元)?|万元|元|[KMBkmb])(?:\s*(?:人民币|CNY|RMB|USD|美元))?)/iu,
      ],
      parseMoney,
      {
        kind: "money",
        crossPageLabel: /(?:投前估值|Pre[- ]?money(?: Valuation)?|本轮投前)/iu,
      }
    ),
    orderAmount: factFromMatch(
      pages,
      [
        /(?:在手订单|已签订单|订单金额|累计订单)\s*[:：]\s*([^\n。；;]{1,50})/i,
        /\|\s*(?:[^|\n]{0,30})?新增(?:已签|签约)?订单(?:总额)?\s*\|\s*\*{0,2}([^|\n]{1,50})\s*\|/iu,
        /新增(?:已签|签约)?订单(?:总额)?\s*(?:为|[:：])?\s*\*{0,2}\s*((?:人民币|CNY|RMB|¥|￥|\$)?\s*[\d,.]+\s*(?:亿元|千万(?:元)?|百万(?:元)?|万元|元|[KMBkmb])(?:\s*(?:人民币|CNY|RMB|USD|美元))?)/iu,
      ],
      parseMoney,
      {
        kind: "money",
        crossPageLabel: /(?:在手订单|已签订单|订单金额|累计订单)/iu,
      }
    ),
    hasLoi: booleanFact(pages, /\bLOI\b|意向订单|采购意向书|框架协议/iu),
    revenueAmount: factFromMatch(
      pages,
      [
        /(?:近12个月收入|年度收入|营业收入|累计收入|收入)\s*[:：]\s*([^\n。；;]{1,50})/i,
        /\|\s*(?:2026H1|上半年)\s*(?:确认)?收入\s*\|\s*\*{0,2}([^|\n]{1,50})\s*\|/iu,
        /2026\s*年上半年确认收入\s*\*{0,2}\s*((?:人民币|CNY|RMB|¥|￥|\$)?\s*[\d,.]+\s*(?:亿元|千万(?:元)?|百万(?:元)?|万元|元|[KMBkmb])(?:\s*(?:人民币|CNY|RMB|USD|美元))?)/iu,
      ],
      parseMoney,
      {
        kind: "money",
        crossPageLabel: /(?:近12个月收入|年度收入|营业收入|累计收入|收入)/iu,
      }
    ),
    payingCustomerCount: factFromMatch(
      pages,
      [
        /(?:付费客户数|已付费客户|付费企业客户)\s*[:：]\s*([^\n。；;]{1,30})/i,
        /\|\s*付费客户\s*\|\s*\*{0,2}([^|\n]{1,30})\s*\|/iu,
        /截至[^。\n]{0,80}?(?:拥有|达到|为)?\s*\*{0,2}(\d+(?:\.\d+)?\s*家)\s*付费客户/iu,
      ],
      parseCount
    ),
    customers: factFromMatch(pages, [
      new RegExp(
        `(?:付费客户|核心客户|客户情况|客户)\\s*[:：]\\s*${line}`,
        "i"
      ),
      /截至[^。\n]{0,80}?(\d+(?:\.\d+)?\s*家付费客户)/iu,
    ]),
    customerConcentration: factFromMatch(
      pages,
      [
        /(?:第一大客户(?:收入)?占比|最大客户(?:收入)?占比|客户集中度)\s*[:：]\s*([^\n。；;]{1,30})/i,
        /(?:最大单一客户|第一大客户)(?:收入)?占比\s*(?:为|[:：])\s*\*{0,2}([^\n。；;]{1,30})/iu,
      ],
      parsePercent
    ),
    grossMargin: factFromMatch(
      pages,
      [
        /(?:综合毛利率|毛利率|毛利)\s*[:：]\s*([^\n。；;]{1,30})/i,
        /\|\s*(?:2026H1|上半年)\s*综合毛利率\s*\|\s*\*{0,2}([^|\n]{1,30})\s*\|/iu,
        /2026\s*年上半年[^。\n]{0,80}?综合毛利率\s*\*{0,2}([^\n。；;]{1,30})/iu,
      ],
      parsePercent
    ),
    cashBalance: factFromMatch(
      pages,
      [
        /(?:账面现金|现金余额|可用现金)\s*[:：]\s*([^\n。；;]{1,40})/i,
        /\|\s*账面现金\s*\|\s*\*{0,2}([^|\n]{1,40})\s*\|/iu,
        /账面现金\s*(?:为|[:：])\s*\*{0,2}([^\n。；;]{1,40})/iu,
      ],
      parseMoney,
      { kind: "money", crossPageLabel: /(?:账面现金|现金余额|可用现金)/iu }
    ),
    monthlyBurn: factFromMatch(
      pages,
      [
        /(?:月度现金消耗|月均现金消耗|月度烧钱|月均支出|月度净消耗)\s*[:：]\s*([^\n。；;]{1,40})/i,
        /\|\s*近三个月平均净消耗\s*\|\s*\*{0,2}([^|\n]{1,40})\s*\|/iu,
        /平均净现金消耗\s*(?:为|[:：])\s*\*{0,2}([^\n。；;]{1,40})/iu,
      ],
      parseMoney,
      {
        kind: "money",
        crossPageLabel:
          /(?:月度现金消耗|月均现金消耗|月度烧钱|月均支出|月度净消耗)/iu,
      }
    ),
    runwayMonths: factFromMatch(
      pages,
      [
        /(?:现金跑道|资金跑道|runway)\s*[:：]\s*([^\n。；;]{1,30})/i,
        /\|\s*静态现金跑道\s*\|\s*\*{0,2}([^|\n]{1,30})\s*\|/iu,
        /现金跑道\s*(?:为|[:：])\s*\*{0,2}([^\n。；;]{1,30})/iu,
      ],
      parseMonths
    ),
    team: factFromMatch(pages, [
      new RegExp(`(?:核心团队|创始团队|团队)\\s*[:：]\\s*${line}`, "i"),
    ]),
    businessModel: factFromMatch(pages, [
      new RegExp(`(?:商业模式|收入模式|收费模式)\\s*[:：]\\s*${line}`, "i"),
      /公司采用\s*[“"]?([^\n。]{3,100}?三类收入组合)/iu,
    ]),
    fundingUse: factFromMatch(pages, [
      new RegExp(`(?:资金用途|融资用途|本轮资金计划)\\s*[:：]\\s*${line}`, "i"),
      /本轮融资金额[^\n]{0,180}?主要用于\s*([^\n。]{3,120})/iu,
    ]),
  };
}

function collectExplicitRisks(document: ParsedDocument): AnalysisItem[] {
  const risks: AnalysisItem[] = [];
  for (const page of document.pages) {
    const match =
      /(?:主要风险|风险提示|当前风险)\s*[:：]\s*([^\n]{3,160})/i.exec(
        page.text
      );
    if (!match) continue;
    risks.push({
      level: "medium",
      title: "BP 明示风险",
      detail: clean(match[1]).slice(0, 160),
      evidencePages: [page.page],
      basis: "explicit",
    });
  }
  return risks.slice(0, 4);
}

function buildRisks(
  facts: Record<string, EvidenceFact>,
  document: ParsedDocument
) {
  const risks = collectExplicitRisks(document);
  const revenue = trustedValue(facts, "revenueAmount");
  const order = trustedValue(facts, "orderAmount");
  const hasLoi = trustedValue(facts, "hasLoi") === true;
  const runway = trustedValue(facts, "runwayMonths");
  const margin = trustedValue(facts, "grossMargin");
  const concentration = trustedValue(facts, "customerConcentration");
  if ((order || hasLoi) && !revenue) {
    risks.push({
      level: "medium",
      title: "订单到收入的转化仍需验证",
      detail: "材料提供了订单或意向信息，但未找到可核验的收入数据。",
      evidencePages: [facts.orderAmount.page, facts.hasLoi.page].filter(
        (page): page is number => page !== null
      ),
      basis: "derived",
    });
  }
  if (typeof runway === "number" && runway < 9) {
    risks.push({
      level: runway < 4 ? "high" : "medium",
      title: "现金跑道偏短",
      detail: `材料披露现金跑道约 ${runway} 个月，需核对融资到账时间与降本预案。`,
      evidencePages: facts.runwayMonths.page ? [facts.runwayMonths.page] : [],
      basis: "derived",
    });
  }
  if (typeof margin === "number" && margin < 25) {
    risks.push({
      level: "medium",
      title: "毛利水平承压",
      detail: `材料披露毛利率约 ${margin}%，需要验证规模化后的单位经济性。`,
      evidencePages: facts.grossMargin.page ? [facts.grossMargin.page] : [],
      basis: "derived",
    });
  }
  if (!facts.customers.value) {
    risks.push({
      level: "medium",
      title: "客户质量与集中度未知",
      detail: "材料未提供足够的客户构成、续约或集中度信息。",
      evidencePages: [],
      basis: "missing_information",
    });
  }
  if (typeof concentration === "number" && concentration >= 50) {
    risks.push({
      level: concentration >= 70 ? "high" : "medium",
      title: "客户集中度偏高",
      detail: `材料披露第一大客户占比约 ${concentration}%，需核对续约、议价权与客户替代计划。`,
      evidencePages: facts.customerConcentration.page
        ? [facts.customerConcentration.page]
        : [],
      basis: "derived",
    });
  }
  return risks;
}

function buildChecks(facts: Record<string, EvidenceFact>): CommercialCheck[] {
  const order = trustedValue(facts, "orderAmount");
  const revenue = trustedValue(facts, "revenueAmount");
  const margin = trustedValue(facts, "grossMargin");
  const burn = trustedValue(facts, "monthlyBurn");
  const runway = trustedValue(facts, "runwayMonths");
  const fundingUse = trustedValue(facts, "fundingUse");
  const concentration = trustedValue(facts, "customerConcentration");
  const valuation = trustedValue(facts, "preMoneyValuation");
  const fundingAmount = trustedValue(facts, "fundingAmount");
  const realization =
    typeof order === "number" &&
    order > 0 &&
    typeof revenue === "number" &&
    revenue >= 0
      ? revenue / order
      : null;
  const impliedDilution =
    typeof valuation === "number" &&
    valuation > 0 &&
    typeof fundingAmount === "number" &&
    fundingAmount > 0
      ? fundingAmount / (valuation + fundingAmount)
      : null;
  const workingCapitalUse =
    typeof fundingUse === "string" &&
    /垫资|库存|备货|采购|保证金|应收账款|流动资金/iu.test(fundingUse);
  return [
    {
      name: "订单与收入兑现",
      result:
        realization === null
          ? order && !revenue
            ? "attention"
            : "unknown"
          : realization >= 0.4
            ? "pass"
            : "attention",
      detail:
        realization !== null
          ? `披露收入约为订单金额的 ${(realization * 100).toFixed(0)}%。该比例仅用于核对商业兑现口径，不等同于回款率。`
          : order && !revenue
            ? "有订单证据，但未找到收入确认口径。"
            : "材料未同时提供订单与收入数据。",
      evidencePages: [facts.orderAmount.page, facts.revenueAmount.page].filter(
        (page): page is number => page !== null
      ),
    },
    {
      name: "客户集中度",
      result:
        typeof concentration === "number"
          ? concentration <= 40
            ? "pass"
            : "attention"
          : "unknown",
      detail:
        typeof concentration === "number"
          ? `第一大客户占比约 ${concentration}%。`
          : "未披露第一大客户收入占比。",
      evidencePages: facts.customerConcentration.page
        ? [facts.customerConcentration.page]
        : [],
    },
    {
      name: "单位经济性",
      result:
        typeof margin === "number"
          ? margin >= 30
            ? "pass"
            : "attention"
          : "unknown",
      detail:
        typeof margin === "number"
          ? `披露毛利率 ${margin}%。`
          : "未找到毛利率，无法判断单位经济性。",
      evidencePages: facts.grossMargin.page ? [facts.grossMargin.page] : [],
    },
    {
      name: "现金安全边际",
      result:
        typeof runway === "number"
          ? runway >= 12
            ? "pass"
            : "attention"
          : "unknown",
      detail:
        typeof runway === "number"
          ? `披露跑道 ${runway} 个月${typeof burn === "number" ? `，月度现金消耗约 ${burn.toLocaleString("zh-CN")} 元` : ""}。`
          : "未找到现金跑道，无法判断融资紧迫度。",
      evidencePages: [facts.runwayMonths.page, facts.monthlyBurn.page].filter(
        (page): page is number => page !== null
      ),
    },
    {
      name: "融资定价与稀释",
      result:
        impliedDilution === null
          ? "unknown"
          : impliedDilution <= 0.3
            ? "pass"
            : "attention",
      detail:
        impliedDilution !== null
          ? `按披露投前估值和融资额测算，本轮股权稀释约 ${(impliedDilution * 100).toFixed(1)}%。`
          : "未同时找到投前估值和本轮融资额。",
      evidencePages: [
        facts.preMoneyValuation.page,
        facts.fundingAmount.page,
      ].filter((page): page is number => page !== null),
    },
    {
      name: "资金用途与增长里程碑",
      result: fundingUse
        ? workingCapitalUse
          ? "attention"
          : "pass"
        : "unknown",
      detail: fundingUse
        ? workingCapitalUse
          ? "资金用途包含备货、采购、垫资或流动资金，需要区分增长投入与营运资金占用。"
          : "材料披露了资金用途，仍需与未来 12-18 个月里程碑逐项对应。"
        : "未找到资金用途拆分。",
      evidencePages: facts.fundingUse.page ? [facts.fundingUse.page] : [],
    },
  ];
}

function recommendStatus(
  facts: Record<string, EvidenceFact>,
  document: ParsedDocument
): AnalysisStatus {
  const coreKeys = Object.keys(fieldLabels).filter(key => key !== "hasLoi");
  const completeness = coreKeys.filter(
    key => trustedValue(facts, key) !== null
  ).length;
  const revenue = trustedValue(facts, "revenueAmount");
  const order = trustedValue(facts, "orderAmount");
  const runway = trustedValue(facts, "runwayMonths");
  const margin = trustedValue(facts, "grossMargin");
  if (document.text.trim().length < 80 || completeness < 4) return "信息不足";
  if (typeof runway === "number" && runway < 4) return "高风险待核实";
  if (
    typeof revenue === "number" &&
    revenue >= 10_000_000 &&
    trustedValue(facts, "customers") &&
    typeof margin === "number" &&
    margin >= 30 &&
    completeness >= 8
  ) {
    return "商业信号较强";
  }
  if (typeof revenue === "number" && revenue > 0 && completeness >= 7)
    return "商业信号较强";
  if (
    (typeof order === "number" && order > 0) ||
    trustedValue(facts, "hasLoi") === true
  )
    return "已有商业信号";
  return "已完成初筛";
}

function buildRecommendations(
  facts: Record<string, EvidenceFact>,
  missingInformation: string[],
  ambiguousInformation: Array<{ label: string }>
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  if (ambiguousInformation.length) {
    recommendations.push({
      section: "事实核对",
      recommendation: `确认存在歧义的字段：${ambiguousInformation
        .map(item => item.label)
        .slice(0, 5)
        .join("、")}。`,
      reason:
        "同一字段出现多个值、单位或币种不明确，或数字跨页断裂；在确认前不参与派生判断。",
      source: "codex_rule",
    });
  }
  if (missingInformation.length) {
    recommendations.push({
      section: "数据与证据",
      recommendation: `补充并标注可核验来源：${missingInformation.slice(0, 5).join("、")}。`,
      reason:
        "当前材料缺少这些关键投资判断输入；建议新增数据页并注明统计口径和日期。",
      source: "codex_rule",
    });
  }
  if (
    trustedValue(facts, "orderAmount") ||
    trustedValue(facts, "hasLoi") === true
  ) {
    recommendations.push({
      section: "商业进展",
      recommendation:
        "将订单、LOI、已交付、验收和回款拆成独立漏斗，并为每项标注合同/回款证据页。",
      reason:
        "订单和意向不等于收入，拆分口径可避免把不同确定性的进展混为一谈。",
      source: "codex_rule",
    });
  }
  if (
    !trustedValue(facts, "monthlyBurn") ||
    !trustedValue(facts, "runwayMonths")
  ) {
    recommendations.push({
      section: "财务计划",
      recommendation:
        "增加 18 个月月度现金流、关键招聘节点和本轮融资后的跑道测算。",
      reason:
        "早期投资判断需要把资金用途与里程碑、现金消耗和下一轮融资窗口对应起来。",
      source: "codex_rule",
    });
  }
  if (!trustedValue(facts, "businessModel")) {
    recommendations.push({
      section: "商业模式",
      recommendation:
        "用一页明确客户、付费主体、定价单位、销售周期、交付成本和续费机制。",
      reason: "当前材料不足以复核收入形成和规模化逻辑。",
      source: "codex_rule",
    });
  }
  return recommendations;
}

export function analyzeDocument(
  document: ParsedDocument,
  sourceFileId: string
) {
  const facts = extractFacts(document);
  const missingInformation = Object.entries(fieldLabels)
    .filter(
      ([key]) => facts[key]?.value === null || facts[key]?.value === false
    )
    .map(([, label]) => label);
  const ambiguousInformation = Object.entries(fieldLabels)
    .filter(([key]) => facts[key]?.verificationStatus === "ambiguous")
    .map(([fieldKey, label]) => ({
      fieldKey,
      label,
      reasons: facts[fieldKey].ambiguityReasons ?? [],
      candidates: facts[fieldKey].candidates ?? [],
    }));
  const aiStatus = recommendStatus(facts, document);
  const company = trustedValue(facts, "company");
  const product = trustedValue(facts, "product");
  const industry = trustedValue(facts, "industry");
  const summaryParts = [company, product, industry].filter(
    (value): value is string => typeof value === "string"
  );
  const summary = summaryParts.length
    ? `${summaryParts.join(" / ")}。本结论仅基于当前本地材料中的可定位证据。`
    : "当前材料不足以形成完整项目摘要；未识别的字段保持为空。";
  const tags = [industry, trustedValue(facts, "fundingRound"), aiStatus]
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
    .filter((value, index, values) => values.indexOf(value) === index);

  const payload: AnalysisPayload = {
    schemaVersion: "1.1",
    engine: "deterministic-local-v1",
    generatedAt: new Date().toISOString(),
    sourceFileId,
    summary,
    facts,
    tags,
    risks: buildRisks(facts, document),
    missingInformation,
    ambiguousInformation,
    commercialChecks: buildChecks(facts),
    aiStatus,
  };
  return {
    payload,
    recommendations: buildRecommendations(
      facts,
      missingInformation,
      ambiguousInformation
    ),
  };
}
