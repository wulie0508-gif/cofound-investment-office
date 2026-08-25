import type { NavigableShareFile } from "@/components/share/ShareDocumentNavigator";

const PAGE_TITLES = {
  bp: [
    "项目概览",
    "行业痛点",
    "产品方案",
    "系统架构",
    "商业模式",
    "市场空间",
    "订单与客户",
    "交付体系",
    "竞争格局",
    "增长计划",
    "财务概览",
    "毛利结构",
    "现金规划",
    "融资用途",
    "核心团队",
    "里程碑",
    "风险与应对",
    "本轮融资",
  ],
  finance: [
    "模型口径",
    "收入结构",
    "订单转化",
    "毛利拆解",
    "人员成本",
    "研发投入",
    "销售费用",
    "现金流",
    "资产负债",
    "三年预测",
    "敏感性分析",
    "关键假设",
  ],
  customer: [
    "客户验证总览",
    "客户 A 访谈",
    "客户 B 访谈",
    "客户 C 访谈",
    "试点验收记录",
    "LOI 摘要",
    "复购与扩站",
    "回款计划",
    "待补充材料",
  ],
} as const;

export type DemoShareFile = NavigableShareFile & {
  kind: keyof typeof PAGE_TITLES;
  version: string;
  sharedAt: string;
};

function DemoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

export function ShareDemoPageCanvas({
  file,
  page,
}: {
  file: DemoShareFile;
  page: number;
}) {
  const title = PAGE_TITLES[file.kind][page - 1] ?? `第 ${page} 页`;

  return (
    <article
      className="mx-auto aspect-[210/297] max-w-[560px] border border-border bg-white p-6 text-slate-950 shadow-sm sm:p-10"
      aria-label={`${file.originalName} 第 ${page} 页预览`}
    >
      <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-slate-500">
        CHENGCHUAN ENERGY · {file.version.toUpperCase()}
      </p>
      {file.kind === "bp" && page === 1 ? (
        <>
          <h3 className="mt-8 text-3xl font-bold leading-tight tracking-[-0.045em] sm:text-5xl">
            让储能系统
            <br />
            可预测、可调度
          </h3>
          <p className="mt-5 max-w-sm text-sm leading-6 text-slate-600">
            面向工商业储能站的预测调度软件与运维服务。
          </p>
          <div className="mt-10 grid grid-cols-2 gap-px bg-slate-300 text-sm">
            <DemoMetric label="已披露订单" value="¥2,800 万" />
            <DemoMetric label="年度收入" value="¥1,200 万" />
            <DemoMetric label="毛利率" value="35%" />
            <DemoMetric label="现金跑道" value="15 个月" />
          </div>
        </>
      ) : (
        <>
          <p className="mt-8 font-mono text-xs font-bold text-slate-500">
            {String(page).padStart(2, "0")} / {file.pageCount}
          </p>
          <h3 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            {title}
          </h3>
          <div className="mt-8 space-y-3">
            <div className="h-2 w-4/5 bg-slate-900" />
            <div className="h-2 w-full bg-slate-300" />
            <div className="h-2 w-11/12 bg-slate-300" />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-px bg-slate-300 text-sm">
            <DemoMetric
              label={file.kind === "finance" ? "模型版本" : "证据状态"}
              value={file.kind === "finance" ? "Base v2" : "已核对"}
            />
            <DemoMetric label="证据定位" value={`第 ${page} 页`} />
          </div>
          <p className="mt-8 text-sm leading-6 text-slate-600">
            这里模拟该页的正文、图表和原始证据。正式分享时将直接显示管理员勾选的文件版本。
          </p>
        </>
      )}
      <p className="mt-8 font-mono text-xs text-slate-500">
        {String(page).padStart(2, "0")} / {file.pageCount}
      </p>
    </article>
  );
}
