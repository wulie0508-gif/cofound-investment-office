import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  MATERIAL_CATEGORY_LABELS,
  type MaterialCategory,
  type ProjectFile,
} from "../../shared/bp";
import { analyzeDocument } from "./analyzer";
import {
  getDatabase,
  normalizeProjectName,
  type LocalDatabase,
} from "./database";
import { extractDocument, MATERIAL_EXTENSIONS } from "./extractor";
import { importDocument } from "./importer";

export type MaterialIntakeResult = {
  intakeType: "bp" | "material";
  projectId: string | null;
  fileId: string;
  duplicate: boolean;
  category: MaterialCategory;
  categoryLabel: string;
  destination: "project" | "pending";
  extractionStatus: ProjectFile["extractionStatus"];
  aiStatus?: string;
};

function safeName(value: string) {
  const cleaned = path
    .basename(value)
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "project-material").slice(0, 180);
}

export function classifyMaterial(
  filename: string,
  text: string,
): MaterialCategory {
  const name = filename.normalize("NFKC");
  const sample = text.slice(0, 40_000);
  const combined = `${name}\n${sample}`;
  if (/财务模型|财务预测|盈利预测|预算|现金流|financial\s*model|forecast/i.test(name))
    return "financial_model";
  if (/尽调|due\s*diligence|dd\s*(?:list|question)|调查清单/i.test(name))
    return "due_diligence";
  if (/章程|营业执照|股权结构|法律意见|知识产权|专利|cap\s*table/i.test(name))
    return "company_legal";
  if (/合同|订单|采购单|销售合同|客户证明|loi|意向书/i.test(name))
    return "contracts_orders";
  if (/行业报告|市场研究|竞品分析|研究报告|market\s*research/i.test(name))
    return "market_research";
  if (/会议纪要|访谈纪要|沟通纪要|meeting\s*notes?/i.test(name))
    return "meeting_notes";

  const filenameSignals = /(?:^|[-_\s])(bp|pitch\s*deck)(?:[-_\s.]|$)|商业计划书|融资计划书/i.test(
    name,
  );
  const contentSignals = [
    /公司名称[：:]/.test(sample),
    /核心产品[：:]/.test(sample),
    /融资轮次[：:]/.test(sample),
    /融资需求[：:]/.test(sample),
    /商业模式[：:]/.test(sample),
  ].filter(Boolean).length;
  if (filenameSignals || contentSignals >= 3) return "bp";
  if (/产品手册|技术白皮书|技术方案|产品说明|demo/i.test(name))
    return "product_material";
  if (/财务|收入|利润|成本|现金流|资产负债/.test(combined))
    return "financial_model";
  return "other";
}

function inferProject(
  filename: string,
  text: string,
  database: LocalDatabase,
) {
  const identities = database
    .listProjectIdentities()
    .sort((left, right) => right.name.length - left.name.length);
  const haystack = `${filename}\n${text.slice(0, 60_000)}`.normalize("NFKC");
  const direct = identities.find(
    project => project.name.length >= 2 && haystack.includes(project.name),
  );
  if (direct) return direct.id;
  if (text.trim()) {
    const analysis = analyzeDocument(
      { pages: [{ page: 1, text }], text },
      "material-project-inference",
    );
    const company = analysis.payload.facts.company?.value;
    if (typeof company === "string" && company.trim()) {
      const key = normalizeProjectName(company);
      return identities.find(project => project.nameKey === key)?.id ?? null;
    }
  }
  return null;
}

export async function importAnyFilePath(
  sourcePath: string,
  options: { projectId?: string; category?: MaterialCategory } = {},
  database: LocalDatabase = getDatabase(),
): Promise<MaterialIntakeResult> {
  const absolute = path.resolve(sourcePath);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error("路径不是文件");
  if (stat.size === 0) throw new Error("文件为空");
  if (stat.size > 50 * 1024 * 1024) throw new Error("文件超过 50MB 限制");
  const extension = path.extname(absolute).toLowerCase();
  if (!MATERIAL_EXTENSIONS.includes(extension))
    throw new Error("暂不接收该资料格式");
  const buffer = fs.readFileSync(absolute);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const existingBp = database.findFileByHash(sha256);
  if (existingBp) {
    return {
      intakeType: "bp",
      projectId: String(existingBp.project_id),
      fileId: String(existingBp.id),
      duplicate: true,
      category: "bp",
      categoryLabel: MATERIAL_CATEGORY_LABELS.bp,
      destination: "project",
      extractionStatus: String(
        existingBp.extraction_status,
      ) as ProjectFile["extractionStatus"],
    };
  }
  const existingMaterial = database.findMaterialByHash(sha256);
  if (existingMaterial) {
    const category = String(existingMaterial.category) as MaterialCategory;
    return {
      intakeType: "material",
      projectId:
        typeof existingMaterial.project_id === "string"
          ? existingMaterial.project_id
          : null,
      fileId: String(existingMaterial.id),
      duplicate: true,
      category,
      categoryLabel: MATERIAL_CATEGORY_LABELS[category],
      destination: existingMaterial.project_id ? "project" : "pending",
      extractionStatus: String(
        existingMaterial.extraction_status,
      ) as ProjectFile["extractionStatus"],
    };
  }

  const extraction = await extractDocument(buffer, path.basename(absolute));
  const category =
    options.category ?? classifyMaterial(path.basename(absolute), extraction.text);
  if (category === "bp") {
    const result = await importDocument(
      {
        buffer,
        originalName: path.basename(absolute),
        projectId: options.projectId,
      },
      database,
    );
    return {
      intakeType: "bp",
      projectId: result.projectId,
      fileId: result.fileId,
      duplicate: result.duplicate,
      category,
      categoryLabel: MATERIAL_CATEGORY_LABELS[category],
      destination: "project",
      extractionStatus: result.extractionStatus,
      aiStatus: result.aiStatus,
    };
  }

  const projectId =
    options.projectId ??
    inferProject(path.basename(absolute), extraction.text, database);
  if (projectId && !database.getProjectRow(projectId))
    throw new Error("指定的项目不存在");
  const id = `m_${randomUUID()}`;
  const targetDirectory = path.resolve(
    database.dataDir,
    "materials",
    projectId ?? "inbox",
  );
  if (!targetDirectory.startsWith(database.dataDir + path.sep))
    throw new Error("非法资料目录");
  fs.mkdirSync(targetDirectory, { recursive: true });
  const storedName = `${sha256.slice(0, 12)}-${safeName(path.basename(absolute))}`;
  const targetPath = path.resolve(targetDirectory, storedName);
  if (!targetPath.startsWith(targetDirectory + path.sep))
    throw new Error("非法资料文件名");
  fs.writeFileSync(targetPath, buffer, { flag: "wx" });
  try {
    database.insertMaterial({
      id,
      projectId,
      suggestedProjectId: projectId,
      originalName: safeName(path.basename(absolute)),
      storedPath: path.relative(database.dataDir, targetPath),
      mimeType: extraction.mimeType,
      sizeBytes: buffer.length,
      sha256,
      category,
      extractionStatus: extraction.status,
      extractionError: extraction.error,
      extractedText: extraction.text,
      pageCount: extraction.pages.length,
    });
  } catch (error) {
    try {
      fs.unlinkSync(targetPath);
    } catch {
      // Preserve the database error.
    }
    throw error;
  }
  return {
    intakeType: "material",
    projectId,
    fileId: id,
    duplicate: false,
    category,
    categoryLabel: MATERIAL_CATEGORY_LABELS[category],
    destination: projectId ? "project" : "pending",
    extractionStatus: extraction.status,
  };
}
