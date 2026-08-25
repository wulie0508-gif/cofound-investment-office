import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ImportResult } from "../../shared/bp";
import { analyzeDocument } from "./analyzer";
import { getDatabase, LocalDatabase, normalizeProjectName } from "./database";
import { extractDocument, SUPPORTED_EXTENSIONS } from "./extractor";
import { OperationLedger } from "./operation-ledger";
import { restoreLocalProject } from "./project-lifecycle-service";

function safeFileName(value: string) {
  const cleaned = path
    .basename(value)
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "pitch-deck").slice(0, 180);
}

function fileStem(value: string) {
  return path
    .basename(value, path.extname(value))
    .replace(/(?:[-_\s]*(?:v|ver|version|版本)\s*\d+(?:\.\d+)*)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export type ImportDocumentInput = {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  projectId?: string;
  projectName?: string;
  description?: string;
};

export async function importDocument(
  input: ImportDocumentInput,
  database: LocalDatabase = getDatabase(),
  ledger: OperationLedger = new OperationLedger(database)
): Promise<ImportResult> {
  if (input.buffer.length === 0) throw new Error("文件为空");
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  const operation = ledger.start({
    operationType: "import",
    projectId: input.projectId ?? null,
    fileHash: sha256,
    actor: { kind: "system", id: "local-importer" },
    metadata: {
      fileName: safeFileName(input.originalName),
      sizeBytes: input.buffer.length,
      requestedProjectId: input.projectId ?? null,
    },
  });
  try {
    const existingFile = database.findFileByHash(sha256);
    if (existingFile) {
      const project = database.getProject(existingFile.project_id);
      const restoredFromRecycleBin = database.isProjectArchived(
        existingFile.project_id
      );
      if (restoredFromRecycleBin)
        restoreLocalProject(
          {
            projectId: existingFile.project_id,
            requestedBy: "本地导入恢复",
            source: "system",
            note: "重新导入已存在的原文件，项目已从回收站恢复",
          },
          database
        );
      const result = {
        projectId: existingFile.project_id,
        fileId: existingFile.id,
        duplicate: true,
        versionNumber: Number(existingFile.version_number),
        extractionStatus: existingFile.extraction_status,
        aiStatus: project?.aiStatus ?? "信息不足",
        restoredFromRecycleBin,
      };
      ledger.succeed(operation.operationId, {
        duplicate: true,
        projectId: result.projectId,
        fileId: result.fileId,
        versionNumber: result.versionNumber,
        restoredFromRecycleBin,
      });
      return result;
    }

    const fileId = `f_${randomUUID()}`;
    const extraction = await extractDocument(
      input.buffer,
      input.originalName,
      input.mimeType
    );
    const { payload, recommendations } = analyzeDocument(extraction, fileId);
    const extractedCompany = payload.facts.company.value;
    const inferredName =
      input.projectName?.trim() ||
      (typeof extractedCompany === "string" ? extractedCompany : "") ||
      fileStem(input.originalName) ||
      "未命名项目";
    const nameKey = normalizeProjectName(
      typeof extractedCompany === "string" ? extractedCompany : inferredName
    );

    let projectId = input.projectId;
    let projectRow = projectId
      ? database.getProjectRow(projectId)
      : database.findProjectByNameKey(nameKey);
    if (projectId && !projectRow) throw new Error("指定的项目不存在");
    if (!projectId && projectRow && typeof projectRow.id === "string")
      projectId = projectRow.id;
    if (!projectRow) {
      projectId = `p_${randomUUID()}`;
      database.createProject({
        id: projectId,
        name: inferredName,
        nameKey: nameKey || normalizeProjectName(inferredName),
        description: input.description?.trim() || null,
      });
      projectRow = database.getProjectRow(projectId);
    }
    if (!projectId || !projectRow) throw new Error("无法创建本地项目记录");

    const restoredFromRecycleBin = Boolean(projectRow.archived);
    const previous = database.getLatestFile(projectId);
    const versionNumber = database.nextVersion(projectId);
    const projectDirectory = path.resolve(database.filesDir, projectId);
    if (!projectDirectory.startsWith(database.filesDir + path.sep))
      throw new Error("非法项目文件路径");
    fs.mkdirSync(projectDirectory, { recursive: true });
    const storedName = `${String(versionNumber).padStart(3, "0")}-${sha256.slice(0, 12)}-${safeFileName(input.originalName)}`;
    const absolutePath = path.resolve(projectDirectory, storedName);
    if (!absolutePath.startsWith(projectDirectory + path.sep))
      throw new Error("非法文件名");
    fs.writeFileSync(absolutePath, input.buffer, { flag: "wx" });
    const storedPath = path.relative(database.dataDir, absolutePath);

    let inserted = false;
    try {
      database.insertFile({
        id: fileId,
        projectId,
        originalName: safeFileName(input.originalName),
        storedPath,
        mimeType: extraction.mimeType,
        sizeBytes: input.buffer.length,
        sha256,
        versionNumber,
        previousFileId: typeof previous?.id === "string" ? previous.id : null,
        extractionStatus: extraction.status,
        extractionError: extraction.error,
        extractedText: extraction.text,
        pageCount: extraction.pages.length,
      });
      inserted = true;
      database.saveAnalysis(
        projectId,
        fileId,
        `a_${randomUUID()}`,
        payload,
        recommendations
      );
      if (restoredFromRecycleBin)
        restoreLocalProject(
          {
            projectId,
            requestedBy: "新版本导入恢复",
            source: "system",
            note: "新的 BP 版本已成功保存，项目已从回收站恢复",
          },
          database
        );
    } catch (error) {
      if (inserted) {
        database.markAnalysisFailed(
          projectId,
          error instanceof Error ? error.message : String(error)
        );
      } else {
        try {
          fs.unlinkSync(absolutePath);
        } catch {
          // The file belongs to this failed import; leave any cleanup failure visible in logs.
        }
      }
      throw error;
    }

    const result = {
      projectId,
      fileId,
      duplicate: false,
      versionNumber,
      extractionStatus: extraction.status,
      aiStatus: payload.aiStatus,
      restoredFromRecycleBin,
    };
    ledger.succeed(operation.operationId, {
      duplicate: false,
      projectId,
      fileId,
      versionNumber,
      extractionStatus: extraction.status,
      restoredFromRecycleBin,
    });
    return result;
  } catch (error) {
    ledger.fail(operation.operationId, {
      code: "IMPORT_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function importFilePath(
  sourcePath: string,
  options: Omit<ImportDocumentInput, "buffer" | "originalName"> = {},
  database: LocalDatabase = getDatabase()
) {
  const absolute = path.resolve(sourcePath);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error("路径不是文件");
  if (stat.size > 50 * 1024 * 1024) throw new Error("文件超过 50MB 限制");
  return importDocument(
    {
      ...options,
      buffer: fs.readFileSync(absolute),
      originalName: path.basename(absolute),
    },
    database
  );
}

export async function scanDirectory(
  directory: string,
  database: LocalDatabase = getDatabase()
) {
  const root = path.resolve(directory);
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error("扫描路径不是文件夹");
  const candidates: string[] = [];

  function visit(current: string) {
    if (candidates.length >= 500) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (
        entry.isFile() &&
        SUPPORTED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
      ) {
        candidates.push(absolute);
      }
    }
  }
  visit(root);

  const results: Array<ImportResult & { path: string }> = [];
  const errors: Array<{ path: string; error: string }> = [];
  for (const candidate of candidates) {
    try {
      const result = await importFilePath(candidate, {}, database);
      results.push({ ...result, path: candidate });
    } catch (error) {
      errors.push({
        path: candidate,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    directory: root,
    discovered: candidates.length,
    imported: results,
    errors,
  };
}

export async function reanalyzeProject(
  projectId: string,
  database: LocalDatabase = getDatabase()
) {
  if (database.isProjectArchived(projectId))
    throw new Error("项目位于回收站，请先恢复后再分析");
  const latest = database.getLatestFile(projectId);
  if (
    !latest ||
    typeof latest.stored_path !== "string" ||
    typeof latest.id !== "string"
  ) {
    throw new Error("项目没有可分析的本地文件");
  }
  const ledger = new OperationLedger(database);
  const operation = ledger.start({
    operationType: "analysis",
    projectId,
    fileHash: typeof latest.sha256 === "string" ? latest.sha256 : null,
    actor: { kind: "system", id: "deterministic-local-v1" },
    skill: { name: "deterministic-fact-extraction", version: "1.1" },
    metadata: { sourceFileId: latest.id },
  });
  try {
    const absolute = database.resolveStoredFile(latest.stored_path);
    const extraction = await extractDocument(
      fs.readFileSync(absolute),
      String(latest.original_name),
      String(latest.mime_type)
    );
    const { payload, recommendations } = analyzeDocument(extraction, latest.id);
    database.saveAnalysis(
      projectId,
      latest.id,
      `a_${randomUUID()}`,
      payload,
      recommendations
    );
    const result = {
      projectId,
      aiStatus: payload.aiStatus,
      schemaVersion: payload.schemaVersion,
    };
    ledger.succeed(operation.operationId, {
      sourceFileId: latest.id,
      aiStatus: payload.aiStatus,
      factCount: Object.keys(payload.facts).length,
    });
    return result;
  } catch (error) {
    ledger.fail(operation.operationId, {
      code: "DETERMINISTIC_ANALYSIS_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
