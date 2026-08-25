from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)

pdfmetrics.registerFont(TTFont("CofoundCN", r"C:\Windows\Fonts\msyh.ttc", subfontIndex=0))
pdfmetrics.registerFont(TTFont("CofoundCN-Bold", r"C:\Windows\Fonts\msyhbd.ttc", subfontIndex=0))

PAGE_W, PAGE_H = A4
INK = HexColor("#151412")
PAPER = HexColor("#F4F2EC")
MUTED = HexColor("#6D6A63")
RULE = HexColor("#B8B4AB")
RISK = HexColor("#7F1D1D")


PROJECTS = [
    {
        "file": "04-云脉工业智能-天使轮.pdf",
        "company": "云脉工业智能（完全虚构）",
        "tagline": "面向离散制造工厂的 AI 排产与设备异常诊断平台",
        "industry": "工业软件 / 智能制造",
        "round": "天使",
        "funding": "1000万元",
        "product": "云端排产引擎、设备健康监测和工厂数据连接器",
        "customers": "2 家付费试点工厂，6 家处于技术验证阶段",
        "order": "320万元",
        "revenue": None,
        "loi": "与 3 家区域汽车零部件厂签署采购意向书 LOI",
        "gross_margin": "48%",
        "burn": "65万元",
        "runway": "9个月",
        "model": "按工厂收取年度软件订阅费，并对数据连接实施收费",
        "team": "3 名联合创始人，来自工业自动化、算法和企业软件销售",
        "use": "45% 产品研发，30% 交付团队，15% 行业销售，10% 流动资金",
        "problem": "中小工厂排产依赖人工经验，设备数据孤岛导致换线和停机损失难以量化。",
        "solution": "以轻量数据连接器采集设备状态，结合订单约束生成可解释的排产建议。",
        "traction": ["完成 2 条产线的 12 周试点", "平均换线等待时间下降 17%", "合同尚未全部形成回款"],
        "risk": "订单验收与真实回款仍需核实，部署周期可能拖累软件毛利。",
    },
    {
        "file": "05-澄川储能科技-Pre-A轮.pdf",
        "company": "澄川储能科技（完全虚构）",
        "tagline": "工商业储能安全控制器与电站运营软件",
        "industry": "新能源 / 储能",
        "round": "Pre-A",
        "funding": "3000万元",
        "product": "储能安全控制器、热失控预警算法与电站运营 SaaS",
        "customers": "8 家付费客户，最大客户贡献近 12 个月收入的 31%",
        "order": "3500万元",
        "revenue": "1200万元",
        "loi": "与两家 EPC 厂商签署年度框架协议",
        "gross_margin": "28%",
        "burn": "130万元",
        "runway": "13个月",
        "model": "控制器硬件销售加年度软件服务费，软件续费率目标 85%",
        "team": "创始团队 5 人，具备电力电子、消防安全和电站运营经验",
        "use": "35% 量产备货，30% 算法研发，20% 渠道建设，15% 认证与流动资金",
        "problem": "工商业储能项目安全责任分散，事故预警和运营优化缺少统一数据闭环。",
        "solution": "在控制器端完成多源信号融合，并通过云端持续校准风险模型。",
        "traction": ["累计交付 46 套控制器", "近 12 个月软件续费率 78%", "在手订单覆盖未来约 8 个月"],
        "risk": "当前综合毛利率偏低，且最大客户收入占比较高。",
    },
    {
        "file": "06-杏林智诊-A轮.pdf",
        "company": "杏林智诊（完全虚构）",
        "tagline": "县域医院影像辅助诊断与质控协作平台",
        "industry": "医疗 AI / 医疗信息化",
        "round": "A",
        "funding": "8000万元",
        "product": "肺部影像辅助诊断、远程质控和区域影像协同平台",
        "customers": "42 家付费医院，前五大客户收入占比 24%",
        "order": "4800万元",
        "revenue": "3600万元",
        "loi": None,
        "gross_margin": "62%",
        "burn": "210万元",
        "runway": "18个月",
        "model": "医院年度软件订阅、区域平台项目费与算法模块增购",
        "team": "核心团队 7 人，覆盖医疗器械注册、影像算法和医院销售",
        "use": "40% 多病种产品研发，25% 注册与临床，25% 渠道扩张，10% 数据安全",
        "problem": "县域医院影像科医生不足，诊断质量和跨院质控差异明显。",
        "solution": "提供院内辅助诊断与区域质控工作台，保留医生最终决策权。",
        "traction": ["近 12 个月收入同比增长 86%", "核心产品年度续费率 91%", "已完成两项三类医疗器械注册"],
        "risk": "医院回款周期较长，政策与注册要求变化可能影响扩张速度。",
    },
    {
        "file": "07-海岚跨境云-Pre-A轮.pdf",
        "company": "海岚跨境云（完全虚构）",
        "tagline": "面向出海消费品牌的渠道利润与库存协同 SaaS",
        "industry": "企业服务 / 跨境 SaaS",
        "round": "Pre-A",
        "funding": "2500万元",
        "product": "多渠道利润分析、补货预测和海外仓协同软件",
        "customers": "67 家付费品牌客户，年度净收入留存率 112%",
        "order": "1050万元",
        "revenue": "850万元",
        "loi": None,
        "gross_margin": "76%",
        "burn": "95万元",
        "runway": "14个月",
        "model": "按品牌 GMV 分档收取年度订阅费，增值模块单独计费",
        "team": "4 名核心成员，来自跨境电商平台、供应链软件和数据产品",
        "use": "50% 产品与数据研发，30% 北美市场拓展，20% 客户成功",
        "problem": "多渠道账单、广告和仓储费用口径不一致，品牌难以实时判断单品利润。",
        "solution": "连接渠道与海外仓数据，形成利润看板并触发补货和降价建议。",
        "traction": ["付费客户从 24 家增长至 67 家", "平均客单价 12.7 万元/年", "试用到付费转化率 23%"],
        "risk": "平台接口变化和跨境数据合规要求可能增加维护成本。",
    },
    {
        "file": "08-逐光协作机器人-天使轮.pdf",
        "company": "逐光协作机器人（完全虚构）",
        "tagline": "面向小批量装配场景的低代码协作机器人工作站",
        "industry": "机器人 / 高端装备",
        "round": "天使",
        "funding": "1500万元",
        "product": "六轴协作机器人、视觉定位模块和低代码工艺编辑器",
        "customers": "1 家付费客户，4 家试点客户",
        "order": "680万元",
        "revenue": None,
        "loi": "取得 2 份合计 900 万元的采购意向书 LOI",
        "gross_margin": "22%",
        "burn": "88万元",
        "runway": "6个月",
        "model": "机器人工作站项目销售，后续收取维保与工艺软件升级费",
        "team": "核心团队 4 人，来自机器人本体、机器视觉和汽车零部件交付",
        "use": "40% 样机与供应链，30% 工艺软件，20% 交付，10% 市场验证",
        "problem": "小批量制造客户难以承担传统自动化产线的集成周期和改造成本。",
        "solution": "用模块化硬件与可视化工艺编辑器，将典型工位部署缩短到两周。",
        "traction": ["完成首台付费样机交付", "4 家试点仍在验收阶段", "关键减速器依赖单一供应商"],
        "risk": "现金跑道偏短且毛利率较低，在手订单尚未形成规模回款。",
    },
    {
        "file": "09-碳衡数据-A轮.pdf",
        "company": "碳衡数据（完全虚构）",
        "tagline": "供应链碳核算与产品碳足迹协作平台",
        "industry": "双碳 / 企业软件",
        "round": "A",
        "funding": "6000万元",
        "product": "产品碳足迹数据库、供应商填报协作和审计证据管理平台",
        "customers": "31 家付费集团客户，覆盖 2400 家供应商",
        "order": "2900万元",
        "revenue": "2200万元",
        "loi": None,
        "gross_margin": "58%",
        "burn": "175万元",
        "runway": "16个月",
        "model": "集团年度订阅费加供应商节点费，第三方核证服务按项目收费",
        "team": "核心团队 6 人，来自生命周期评价、审计和企业软件领域",
        "use": "45% 行业数据库，25% 产品研发，20% 销售交付，10% 国际标准适配",
        "problem": "出口制造企业缺少可追溯的产品碳数据，供应商填报成本和审计风险高。",
        "solution": "将排放因子、供应商数据与审计证据绑定，形成可复用的产品碳档案。",
        "traction": ["年度经常性收入占比 72%", "客户续费率 89%", "单客户供应商覆盖数持续提升"],
        "risk": "不同地区标准快速变化，咨询交付占比仍可能限制规模化。",
    },
    {
        "file": "10-初见智饮-天使轮.pdf",
        "company": "初见智饮（完全虚构）",
        "tagline": "办公室现制健康饮品设备与订阅服务",
        "industry": "消费科技 / 智能硬件",
        "round": "天使",
        "funding": "1200万元",
        "product": "智能饮品机、低糖原料包与企业健康消费管理后台",
        "customers": "12 家企业试点客户，尚未形成稳定付费续约",
        "order": None,
        "revenue": None,
        "loi": None,
        "gross_margin": "41%",
        "burn": "72万元",
        "runway": "10个月",
        "model": "设备租赁费加原料包按月订阅，企业按实际消耗结算",
        "team": "3 名创始成员，来自小家电、食品研发和企业团购渠道",
        "use": "45% 设备定型，25% 食品合规，20% 试点运营，10% 流动资金",
        "problem": "办公室饮品选择高糖且补给管理分散，企业难以观察真实使用情况。",
        "solution": "以联网设备记录消耗并自动补货，提供低糖配方和企业消费策略。",
        "traction": ["完成 12 个办公室免费试点", "单机日均 23 杯", "付费价格与续约率尚未验证"],
        "risk": "商业化仍处于试点阶段，设备维护和食品供应链复杂度较高。",
    },
    {
        "file": "11-矽澜新材-Pre-A轮-信息不足.pdf",
        "company": "矽澜新材（完全虚构）",
        "tagline": "某先进材料项目的内部接洽摘要",
        "industry": None,
        "round": "Pre-A",
        "funding": None,
        "product": None,
        "customers": None,
        "order": None,
        "revenue": None,
        "loi": None,
        "gross_margin": None,
        "burn": None,
        "runway": None,
        "model": None,
        "team": None,
        "use": None,
        "problem": "团队表示材料可用于某类精密制造工艺，但当前资料没有提供明确指标、客户或验证报告。",
        "solution": "现有材料仅描述方向，缺少产品规格、量产路线、成本结构和知识产权清单。",
        "traction": ["已完成一次初步沟通", "尚未取得正式 BP", "需要补充测试报告和客户访谈证据"],
        "risk": "关键信息不足，不能据此形成投资判断。",
    },
]


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def wrap(text: str, width: float, font: str, size: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        candidate = current + char
        if current and text_width(candidate, font, size) > width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float, size: float = 10, leading: float = 16, font: str = "CofoundCN", color=INK) -> float:
    c.setFont(font, size)
    c.setFillColor(color)
    for line in wrap(text, width, font, size):
        c.drawString(x, y, line)
        y -= leading
    return y


def page_frame(c: canvas.Canvas, project: dict, page: int, section: str) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(INK)
    c.rect(0, PAGE_H - 38, PAGE_W, 38, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("CofoundCN-Bold", 8)
    c.drawString(36, PAGE_H - 24, "COFOUND TEST PORTFOLIO")
    c.setFont("CofoundCN", 7)
    c.drawRightString(PAGE_W - 36, PAGE_H - 24, section.upper())
    c.setStrokeColor(RULE)
    c.line(36, 32, PAGE_W - 36, 32)
    c.setFillColor(MUTED)
    c.setFont("CofoundCN", 7)
    c.drawString(36, 19, "完全虚构 - 仅用于 BP 系统功能测试 - 不构成投资信息")
    c.drawRightString(PAGE_W - 36, 19, f"{page:02d} / 03")


def fact_line(c: canvas.Canvas, label: str, value: str | None, x: float, y: float, width: float) -> float:
    if value is None:
        return y
    c.setFillColor(MUTED)
    c.setFont("CofoundCN", 8)
    c.drawString(x, y, label)
    value_y = draw_wrapped(c, f"{label}：{value}。", x, y - 17, width, 10.5, 16, "CofoundCN-Bold", INK)
    c.setStrokeColor(RULE)
    c.line(x, value_y - 2, x + width, value_y - 2)
    return value_y - 18


def generate(project: dict) -> Path:
    target = OUTPUT / project["file"]
    c = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
    c.setTitle(project["company"])
    c.setAuthor("Cofound BP Desk Test Fixture")

    page_frame(c, project, 1, "Investment Snapshot")
    c.setFillColor(RISK)
    c.setFont("CofoundCN-Bold", 9)
    c.drawString(36, PAGE_H - 76, "TEST FIXTURE / 完全虚构")
    c.setFillColor(INK)
    c.setFont("CofoundCN-Bold", 27)
    c.drawString(36, PAGE_H - 122, project["company"])
    draw_wrapped(c, project["tagline"], 36, PAGE_H - 153, PAGE_W - 72, 12, 19, "CofoundCN", MUTED)

    c.setStrokeColor(INK)
    c.setLineWidth(1.2)
    c.line(36, PAGE_H - 190, PAGE_W - 36, PAGE_H - 190)
    y = PAGE_H - 225
    facts = [
        ("公司名称", project["company"]),
        ("核心产品", project["product"]),
        ("所属行业", project["industry"]),
        ("融资轮次", project["round"]),
        ("融资需求", project["funding"]),
    ]
    left, right = 36, PAGE_W / 2 + 10
    ys = [y, y]
    for index, (label, value) in enumerate(facts):
        column = index % 2
        x = left if column == 0 else right
        ys[column] = fact_line(c, label, value, x, ys[column], PAGE_W / 2 - 54)

    block_y = min(ys) - 12
    c.setFillColor(INK)
    c.setFont("CofoundCN-Bold", 10)
    c.drawString(36, block_y, "问题与方案")
    c.setStrokeColor(RULE)
    c.line(36, block_y - 8, PAGE_W - 36, block_y - 8)
    block_y = draw_wrapped(c, f"问题：{project['problem']}", 36, block_y - 32, PAGE_W - 72, 10, 17)
    draw_wrapped(c, f"方案：{project['solution']}", 36, block_y - 12, PAGE_W - 72, 10, 17)
    c.showPage()

    page_frame(c, project, 2, "Commercial Validation")
    c.setFillColor(INK)
    c.setFont("CofoundCN-Bold", 22)
    c.drawString(36, PAGE_H - 88, "商业验证与单位经济性")
    c.setFont("CofoundCN", 9)
    c.setFillColor(MUTED)
    c.drawString(36, PAGE_H - 110, "本页数字均为虚构测试字段，用于验证筛选、分析和证据定位。")
    y = PAGE_H - 150
    commercial = [
        ("客户", project["customers"]),
        ("在手订单", project["order"]),
        ("近12个月收入", project["revenue"]),
        ("LOI", project["loi"]),
        ("综合毛利率", project["gross_margin"]),
        ("商业模式", project["model"]),
    ]
    for label, value in commercial:
        y = fact_line(c, label, value, 36, y, PAGE_W - 72)
    c.setFillColor(INK)
    c.setFont("CofoundCN-Bold", 10)
    c.drawString(36, y - 2, "阶段性进展")
    y -= 28
    for item in project["traction"]:
        y = draw_wrapped(c, f"- {item}", 42, y + 7, PAGE_W - 84, 10, 17) - 7
    c.showPage()

    page_frame(c, project, 3, "Financing And Risks")
    c.setFillColor(INK)
    c.setFont("CofoundCN-Bold", 22)
    c.drawString(36, PAGE_H - 88, "团队、资金计划与风险")
    y = PAGE_H - 140
    closing = [
        ("核心团队", project["team"]),
        ("月度现金消耗", project["burn"]),
        ("现金跑道", project["runway"]),
        ("资金用途", project["use"]),
    ]
    for label, value in closing:
        y = fact_line(c, label, value, 36, y, PAGE_W - 72)

    y -= 4
    c.setFillColor(RISK)
    c.setFont("CofoundCN-Bold", 10)
    c.drawString(36, y, "风险提示")
    risk_text = project["risk"].rstrip("。")
    y = draw_wrapped(c, f"主要风险：{risk_text}。", 36, y - 24, PAGE_W - 72, 10.5, 18, "CofoundCN-Bold", RISK)

    c.setFillColor(INK)
    c.setFont("CofoundCN-Bold", 10)
    c.drawString(36, y - 18, "测试用途说明")
    draw_wrapped(
        c,
        "该文档由 Codex 自动生成，仅用于验证本地 BP 导入、字段提取、投资状态筛选、版本管理、单项目分享、在线预览和协作批注。文中公司、人物、客户、合同和金额均不对应任何真实主体。",
        36,
        y - 44,
        PAGE_W - 72,
        9,
        16,
        "CofoundCN",
        MUTED,
    )
    c.save()
    return target


if __name__ == "__main__":
    generated = [generate(project) for project in PROJECTS]
    for path in generated:
        print(path)
