export type InvestmentFrameworkPreset = {
  id:
    | "auto-select"
    | "cofound-core"
    | "market-first"
    | "founder-first"
    | "balanced-long-term";
  skillName:
    | "analyze-local-bp"
    | "review-early-stage-investment"
    | "assess-market-first"
    | "assess-founder-first"
    | "assess-long-term-value";
  kind: "router" | "analysis";
  name: string;
  englishName: string;
  shortDescription: string;
  useWhen: string;
  decisionQuestion: string;
  guardrail: string;
  provenance: string;
  dimensions: Array<{ title: string; detail: string }>;
  outputFocus: string[];
  referenceUrl?: string;
};

export type BuiltInSkill = {
  skillName:
    | InvestmentFrameworkPreset["skillName"]
    | "improve-investment-bp"
    | "enhance-cleantech-project"
    | "review-cleantech-financial-evidence"
    | "match-shanghai-cleantech-policies"
    | "match-cleantech-project-opportunities";
  name: string;
  role: "主入口" | "投资判断" | "项目增强" | "BP 优化";
  description: string;
};

export const INVESTMENT_FRAMEWORKS: InvestmentFrameworkPreset[] = [
  {
    id: "auto-select",
    skillName: "analyze-local-bp",
    kind: "router",
    name: "智能选择主框架",
    englishName: "Primary skill router",
    shortDescription:
      "先理解问题、项目阶段和现有证据，再选择一套最合适的专业 Skill；适合作为默认入口。",
    useWhen: "不确定该从哪一种方法开始，或问题同时涉及市场、团队与经营。",
    decisionQuestion: "当前任务最需要哪一套专业判断方法？",
    guardrail: "默认只选择一个专业 Skill，不把多套框架的结论混在一起。",
    provenance: "Cofound 主入口路由规则",
    dimensions: [
      {
        title: "一般初筛",
        detail: "项目问题较综合或没有指定视角时，进入证据优先的核心初筛。",
      },
      {
        title: "市场与时点",
        detail:
          "问题聚焦赛道、市场上限、竞争位置或窗口期时，进入市场优先七维。",
      },
      {
        title: "创始人与团队",
        detail: "材料稀疏或问题聚焦人、组织与执行时，进入创始人优先分析。",
      },
      {
        title: "产业与长期价值",
        detail:
          "硬科技、制造、重交付或资本密集型项目，进入产业与长期价值分析。",
      },
    ],
    outputFocus: [
      "选择的主 Skill",
      "选择理由",
      "证据覆盖情况",
      "专业分析结论",
      "下一步动作",
    ],
  },
  {
    id: "cofound-core",
    skillName: "review-early-stage-investment",
    kind: "analysis",
    name: "Cofound 核心初筛",
    englishName: "Evidence-first screen",
    shortDescription:
      "先核验事实，再判断商业逻辑、主要风险和最低成本的下一步。",
    useWhen: "第一次看项目，或需要对商业、融资和风险做一轮综合初筛。",
    decisionQuestion: "现有证据是否足以支持继续投入时间？",
    guardrail: "不补写未披露事实，不替负责人修改最终管理判断。",
    provenance: "Cofound 内部预设",
    dimensions: [
      { title: "事实边界", detail: "区分已披露事实、推断、缺失信息与建议。" },
      {
        title: "商业验证",
        detail: "核对订单、收入、付费客户、交付和回款是否相互支持。",
      },
      {
        title: "融资效率",
        detail: "检查估值、资金用途、月度消耗和现金跑道是否匹配。",
      },
      { title: "下一步", detail: "给出最能改变投资判断、成本最低的验证动作。" },
    ],
    outputFocus: [
      "投资摘要",
      "一项积极信号",
      "三项关键风险",
      "尚未解决的问题",
      "建议的下一步",
    ],
  },
  {
    id: "market-first",
    skillName: "assess-market-first",
    kind: "analysis",
    name: "市场优先七维",
    englishName: "Market-first seven lenses",
    shortDescription:
      "从赛道空间与爆发窗口出发，继续检查团队、数据、韧性与退出路径。",
    useWhen: "需要判断市场上限、进入时点、竞争位置或潜在退出路径。",
    decisionQuestion: "这个市场是否值得现在进入，项目能否占住关键位置？",
    guardrail: "行业阈值只作为比较情景，不当作通用的机构评分线。",
    provenance: "参考红杉相关行业讨论整理；不是机构官方评分表",
    referenceUrl: "https://mp.weixin.qq.com/s/XmG6ic4dI1WNVl-Ny_pYcw",
    dimensions: [
      {
        title: "赛道卡位",
        detail: "判断市场上限、增长窗口、技术替代和政策敏感性。",
      },
      {
        title: "创始人适配",
        detail: "检查行业认知、0 到 1 执行经历、招人能力和压力预案。",
      },
      {
        title: "数据验证",
        detail: "按行业与阶段选择指标，不把单一阈值当作普适死亡线。",
      },
      {
        title: "商业模式韧性",
        detail: "模拟巨头复制、需求下行和获客成本上升后的表现。",
      },
      {
        title: "条款适配",
        detail: "识别会损伤创始人动力、控制权或后续融资空间的安排。",
      },
      {
        title: "投后匹配",
        detail: "判断投资方能否提供客户、人才、产业或危机处理支持。",
      },
      {
        title: "退出路径",
        detail: "从产业买方、后续融资和资本市场可行性反推进入条件。",
      },
    ],
    outputFocus: [
      "赛道判断",
      "团队适配",
      "关键数据证据",
      "反脆弱性测试",
      "退出假设",
    ],
  },
  {
    id: "founder-first",
    skillName: "assess-founder-first",
    kind: "analysis",
    name: "创始人优先",
    englishName: "Founder-first lens",
    shortDescription:
      "适用于信息仍稀疏的天使轮，重点识别诚信、认知、动力与学习速度。",
    useWhen: "天使或 Pre-A 项目数据仍少，但创始人与团队质量决定成败。",
    decisionQuestion: "现有行为证据是否支持对这支团队继续下注？",
    guardrail: "不根据学历、年龄、表达风格或其他个人特征推断能力与诚信。",
    provenance: "参考早期机构常见的投人逻辑整理",
    dimensions: [
      {
        title: "诚信底线",
        detail: "查找重大经历、数据口径和利益冲突是否自洽。",
      },
      {
        title: "问题认知",
        detail: "判断创始人是否理解行业约束和仍未解决的核心问题。",
      },
      {
        title: "执行证据",
        detail: "优先寻找产品、客户、招聘或交付上的真实行动记录。",
      },
      {
        title: "学习速度",
        detail: "关注反馈闭环、观点更新和早期试错的成本控制。",
      },
    ],
    outputFocus: [
      "创始人优势",
      "诚信与一致性",
      "执行证据",
      "需要面谈验证的行为问题",
    ],
  },
  {
    id: "balanced-long-term",
    skillName: "assess-long-term-value",
    kind: "analysis",
    name: "产业与长期价值",
    englishName: "Balanced long-term lens",
    shortDescription: "同时审视产业理解、经营稳健性、资源整合和长期复利空间。",
    useWhen: "硬科技、制造、企业服务或重交付项目需要按真实产业周期判断。",
    decisionQuestion: "项目能否把产业位置沉淀为可持续的经营与长期壁垒？",
    guardrail: "不以短期增长掩盖交付、现金、资本效率和退出约束。",
    provenance: "参考综合型机构的长期价值视角整理",
    dimensions: [
      { title: "产业理解", detail: "判断供需结构、价值链位置和竞争格局。" },
      {
        title: "经营质量",
        detail: "检查增长、毛利、现金流和交付能力是否协调。",
      },
      { title: "资源整合", detail: "评估客户、供应链、人才和资本的组织能力。" },
      {
        title: "长期价值",
        detail: "判断优势能否沉淀为技术、品牌、网络或成本壁垒。",
      },
    ],
    outputFocus: [
      "产业位置",
      "经营稳健性",
      "资源整合能力",
      "长期壁垒",
      "主要下行情景",
    ],
  },
];

export const BP_OPTIMIZATION_SKILL: BuiltInSkill = {
  skillName: "improve-investment-bp",
  name: "BP 叙事与视觉优化",
  role: "BP 优化",
  description:
    "基于已核验事实、分析结论和信息缺口，优化投资叙事、证据层级、页面结构与视觉表达。",
};

export const SHANGHAI_POLICY_SKILL: BuiltInSkill = {
  skillName: "match-shanghai-cleantech-policies",
  name: "上海清洁能源政策匹配",
  role: "项目增强",
  description:
    "完成用户认证后，按需只读查询飞书政策主库；认证前明确显示不可用，不使用旧表代替。",
};

export const CLEANTECH_ENHANCEMENT_SKILLS: BuiltInSkill[] = [
  {
    skillName: "enhance-cleantech-project",
    name: "清洁能源项目增强",
    role: "项目增强",
    description:
      "按明确问题只选择财务、政策或项目机会中的一项能力，不因行业标签自动执行。",
  },
  {
    skillName: "review-cleantech-financial-evidence",
    name: "清洁能源财务证据审计",
    role: "项目增强",
    description:
      "通过独立 CleanTech 发布版离线核验盈利与单位经济、现金与跑道两个已验证维度。",
  },
  SHANGHAI_POLICY_SKILL,
  {
    skillName: "match-cleantech-project-opportunities",
    name: "清洁能源项目与招标机会",
    role: "项目增强",
    description:
      "认证后只读匹配欧洲与巴西项目候选，并区分有效、待实时核实和已关闭记录。",
  },
];

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    skillName: "analyze-local-bp",
    name: "Cofound 主入口",
    role: "主入口",
    description: "自然语言操作工作台，并自动选择一套最适合的专业分析 Skill。",
  },
  ...INVESTMENT_FRAMEWORKS.filter(item => item.kind === "analysis").map(
    item => ({
      skillName: item.skillName,
      name: item.name,
      role: "投资判断" as const,
      description: item.shortDescription,
    })
  ),
  ...CLEANTECH_ENHANCEMENT_SKILLS,
  BP_OPTIMIZATION_SKILL,
];

export const CODEX_FIRST_EXAMPLES = [
  "扫描 D:\\BP，把新材料导入项目库并告诉我哪些字段存在歧义。",
  "打开这个项目，自动选择最合适的投资框架并给出证据。",
  "根据尚未解决的问题优化这份 BP，但保留所有原始数字。",
  "为这个清洁能源项目匹配上海政策；如果范围不适用就明确告诉我，不要自动写回。",
  "只分享这个项目的融资、订单字段和我指定的文件版本。",
];

export const INSTALL_OR_UPDATE_PLUGIN_PROMPT = `请检查当前 Cofound 工程中的 plugins/cofound-bp-desk，并把它作为本机 Codex 插件安装或更新。安装前核对 plugin.json、SKILL.md、.mcp.json 和所需权限；不要复制 data、.env、日志或任何项目原件。完成后列出已发现的 Skills，并运行各 Skill 的结构校验。`;

export const CREATE_EXTENSION_SKILL_PROMPT = `请在当前 Cofound 工程的 plugins/cofound-bp-desk/skills 中，为我提供的投资方法创建一个边界清晰的独立 Skill。先检查它是否与现有 Skill 重叠；不要修改确定性事实层，不把外部机构观点写成官方规则，不默认触发发布。完成后为它补充 agents/openai.yaml，运行 quick_validate.py，并把它登记到本地“Codex 投资分析”工作台。`;

export function buildInvestmentFrameworkPrompt(input: {
  projectId: string;
  projectName: string;
  framework: InvestmentFrameworkPreset;
}) {
  const dimensions = input.framework.dimensions
    .map((item, index) => `${index + 1}. ${item.title}：${item.detail}`)
    .join("\n");
  const outputFocus = input.framework.outputFocus
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  if (input.framework.kind === "router") {
    return `使用 $analyze-local-bp 处理 Cofound 本地项目。\n\n项目：${input.projectName}\n项目 ID：${input.projectId}\n\n先读取项目最新本地版本、确定性事实和证据，再根据我的问题、项目阶段、商业模式与现有证据，从 $review-early-stage-investment、$assess-market-first、$assess-founder-first、$assess-long-term-value 中选择且只选择一个主分析 Skill。先说明选择结果和理由，再用该 Skill 完成分析；除非我明确要求比较，不要同时运行多套框架。\n\n路由依据：\n${dimensions}\n\n重点输出：\n${outputFocus}\n\n执行闭环：选择主 Skill 后必须调用 prepare_investment_analysis 冻结当前文件与事实快照；只依据返回的 factSnapshot 判断；完成后调用 complete_investment_analysis 结构化回写。若任务已过期，重新准备并重跑，不覆盖历史。\n\n要求：所有关键结论给出真实字段、页码和短引文证据；明确区分事实、推断、缺失信息和建议；最后列出尚未解决的问题、当前 AI 建议和实际管理状态。AI 建议不得覆盖负责人的管理判断。`;
  }

  return `使用 $${input.framework.skillName} 分析 Cofound 本地项目。\n\n项目：${input.projectName}\n项目 ID：${input.projectId}\n框架：${input.framework.name}（${input.framework.englishName}）\n\n分析维度：\n${dimensions}\n\n重点输出：\n${outputFocus}\n\n执行闭环：调用 prepare_investment_analysis（skill_name=${input.framework.skillName}），只依据返回的 factSnapshot 判断；完成后调用 complete_investment_analysis 结构化回写。若任务已过期，重新准备并重跑，不覆盖历史。\n\n要求：明确区分事实、推断、缺失信息和建议；所有关键结论引用真实字段、页码和短引文；不要把机构参考视角描述为机构官方评分表；最后列出尚未解决的问题、当前 AI 建议和实际管理状态。AI 建议不得覆盖负责人的管理判断。`;
}

export function buildBpOptimizationPrompt(input: {
  projectId: string;
  projectName: string;
}) {
  return `使用 $improve-investment-bp 优化 Cofound 本地项目的 BP。\n\n项目：${input.projectName}\n项目 ID：${input.projectId}\n\n先读取最新项目版本、确定性事实、证据、尚未解决的问题和最近一次投资分析。默认先输出“改版方案”，不要覆盖原件；所有数字、客户、订单、引用和结论必须能回到当前事实快照。请给出叙事主线、逐页结构、需要补证据的位置、视觉层级建议和修改清单。若提供了可编辑源文件且我明确要求生成新版，创建新版本并保留原文件。`;
}
