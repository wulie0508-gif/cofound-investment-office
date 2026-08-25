import { ShareDemoAccessGate } from "@/components/share/ShareDemoAccessGate";
import { ShareDemoAnnotations } from "@/components/share/ShareDemoAnnotations";
import { ShareDemoFilePreview } from "@/components/share/ShareDemoFilePreview";
import { LinkShareShell } from "@/components/share/LinkShareShell";
import { ShareInvestmentFacts } from "@/components/share/ShareInvestmentFacts";
import { Button } from "@/components/ui/button";
import type { LinkShareProject } from "@shared/collaboration";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

const DEMO_FIELDS = [
  {
    key: "companyName",
    label: "公司名称",
    englishLabel: "Company",
    value: "澄川储能科技（完全虚构）",
    evidence: {
      page: 1,
      quote: "澄川储能科技有限公司，工商业储能智能调度平台。",
    },
    verification: "supported",
  },
  {
    key: "productService",
    label: "产品与服务",
    englishLabel: "Product & Service",
    value: "工商业储能站的预测调度软件、控制器与年度运维服务",
    evidence: {
      page: 3,
      quote: "软件订阅、控制器交付及年度运维共同构成收入。",
    },
    verification: "supported",
  },
  {
    key: "industry",
    label: "行业分类",
    englishLabel: "Industry",
    value: "新能源与气候科技",
    evidence: { page: 1, quote: "面向工商业储能场景。" },
    verification: "supported",
  },
  {
    key: "businessModel",
    label: "商业模式",
    englishLabel: "Business Model",
    value: "软件年费 + 控制器销售 + 运维服务费",
    evidence: { page: 5, quote: "单站软件年费并叠加控制器和运维收入。" },
    verification: "supported",
  },
  {
    key: "fundingRound",
    label: "融资轮次",
    englishLabel: "Funding Round",
    value: "Pre-A",
    evidence: { page: 18, quote: "本轮计划进行 Pre-A 融资。" },
    verification: "supported",
  },
  {
    key: "fundingAmount",
    label: "融资金额",
    englishLabel: "Funding Amount",
    value: 35_000_000,
    evidence: { page: 18, quote: "计划融资人民币 3,500 万元。" },
    verification: "supported",
  },
  {
    key: "useOfProceeds",
    label: "资金用途",
    englishLabel: "Use of Proceeds",
    value: "45% 产品研发，30% 交付团队，15% 行业销售，10% 流动资金",
    evidence: { page: 18, quote: "资金主要投向产品研发和交付能力建设。" },
    verification: "supported",
  },
  {
    key: "orderAmount",
    label: "订单金额",
    englishLabel: "Order Value",
    value: 28_000_000,
    evidence: { page: 7, quote: "当前已签及中标订单合计约 2,800 万元。" },
    verification: "supported",
  },
  {
    key: "loi",
    label: "LOI / 意向订单",
    englishLabel: "LOI",
    value: true,
    evidence: { page: 7, quote: "另有 4 个储备项目已签署合作意向。" },
    verification: "supported",
  },
  {
    key: "grossMargin",
    label: "毛利率",
    englishLabel: "Gross Margin",
    value: 35,
    evidence: { page: 12, quote: "综合毛利率约为 35%。" },
    verification: "supported",
  },
  {
    key: "runwayMonths",
    label: "现金跑道",
    englishLabel: "Runway",
    value: 15,
    evidence: { page: 13, quote: "现有现金预计可支持约 15 个月运营。" },
    verification: "supported",
  },
  {
    key: "coreTeam",
    label: "核心团队",
    englishLabel: "Core Team",
    value: "创始团队来自储能控制、电力交易和工业软件领域",
    evidence: { page: 15, quote: "核心成员拥有储能控制与工业软件产品经验。" },
    verification: "supported",
  },
] satisfies LinkShareProject["fields"];

export default function ShareDemo() {
  const [verified, setVerified] = useState(true);

  return (
    <LinkShareShell>
      {!verified ? (
        <ShareDemoAccessGate onVerified={() => setVerified(true)} />
      ) : (
        <>
          <header className="mb-6 grid gap-5 border-b border-foreground pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">
                项目分享包 <span lang="en">Project Share Package</span>
                <span className="ml-3 border border-signal/35 bg-signal/5 px-2 py-1 text-[10px] font-bold text-signal">
                  演示样本
                </span>
              </p>
              <h1 className="mt-3 text-[2rem] font-bold leading-tight tracking-[-0.045em] sm:text-[2.65rem]">
                澄川储能科技（完全虚构）
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                本页模拟外部访客通过单项目链接和六位访问码后看到的授权内容。
              </p>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3 lg:flex-col lg:items-end">
              <dl className="grid min-w-[280px] grid-cols-3 divide-x divide-border border border-border bg-card text-center">
                <div className="px-3 py-3">
                  <dt className="text-[10px] text-muted-foreground">原件</dt>
                  <dd className="mt-1 font-mono text-sm font-bold">3</dd>
                </div>
                <div className="px-3 py-3">
                  <dt className="text-[10px] text-muted-foreground">
                    披露字段
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-bold">
                    {DEMO_FIELDS.length}
                  </dd>
                </div>
                <div className="px-3 py-3">
                  <dt className="text-[10px] text-muted-foreground">协作</dt>
                  <dd className="mt-1 text-sm font-bold">可批注</dd>
                </div>
              </dl>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setVerified(false)}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                重新模拟访问码
              </Button>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <ShareDemoFilePreview />
              <ShareInvestmentFacts fields={DEMO_FIELDS} />
            </div>
            <aside className="self-start lg:sticky lg:top-6 lg:col-span-4">
              <ShareDemoAnnotations />
            </aside>
          </div>
        </>
      )}
    </LinkShareShell>
  );
}
