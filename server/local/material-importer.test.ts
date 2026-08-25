import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDatabase } from "./database";
import { importFilePath } from "./importer";
import { classifyMaterial, importAnyFilePath } from "./material-importer";

let temporaryDirectory = "";
let database: LocalDatabase;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-material-test-")
  );
  database = new LocalDatabase({
    dataDir: path.join(temporaryDirectory, "data"),
    dbPath: path.join(temporaryDirectory, "data", "test.sqlite"),
  });
});

afterEach(() => {
  database.close();
  const resolved = path.resolve(temporaryDirectory);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-material-test-")
  ) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

describe("general project material intake", () => {
  it("classifies common investment materials before BP fallback", () => {
    expect(classifyMaterial("星桥-财务预测.xlsx", "")).toBe("financial_model");
    expect(classifyMaterial("项目尽调清单.docx", "")).toBe("due_diligence");
    expect(
      classifyMaterial(
        "demo.md",
        "公司名称：星桥\n核心产品：机器人\n融资轮次：天使轮\n融资需求：800万元"
      )
    ).toBe("bp");
  });

  it("attaches a supplemental material to an existing project and deduplicates it", async () => {
    const bpPath = path.join(temporaryDirectory, "星桥-BP.md");
    fs.writeFileSync(
      bpPath,
      "公司名称：星桥机器人\n核心产品：仓储机器人\n融资轮次：天使轮\n融资需求：800万元"
    );
    const project = await importFilePath(bpPath, {}, database);
    const notesPath = path.join(temporaryDirectory, "星桥机器人-会议纪要.md");
    fs.writeFileSync(notesPath, "本次沟通讨论了产品交付与客户回款计划。");

    const first = await importAnyFilePath(notesPath, {}, database);
    const duplicate = await importAnyFilePath(notesPath, {}, database);
    expect(first.intakeType).toBe("material");
    expect(first.category).toBe("meeting_notes");
    expect(first.projectId).toBe(project.projectId);
    expect(first.destination).toBe("project");
    expect(duplicate.duplicate).toBe(true);
    expect(database.getProject(project.projectId)?.materials).toHaveLength(1);
  });

  it("keeps an unmatched spreadsheet in the pending inbox", async () => {
    const modelPath = path.join(temporaryDirectory, "未知项目-财务模型.xlsx");
    fs.writeFileSync(modelPath, Buffer.from("not-a-real-xlsx-fixture"));
    const result = await importAnyFilePath(modelPath, {}, database);
    expect(result.category).toBe("financial_model");
    expect(result.destination).toBe("pending");
    expect(result.extractionStatus).toBe("unsupported");
    expect(database.listPendingMaterials()).toHaveLength(1);
  });
});

describe("custom project fields", () => {
  it("creates a leader-defined field and stores a project value", async () => {
    const bpPath = path.join(temporaryDirectory, "字段测试-BP.md");
    fs.writeFileSync(
      bpPath,
      "公司名称：字段测试公司\n核心产品：测试产品\n融资轮次：Pre-A轮\n融资需求：1000万元"
    );
    const project = await importFilePath(bpPath, {}, database);
    const definition = database.createFieldDefinition({
      label: "内部优先级",
      fieldType: "select",
      options: ["高", "中", "低"],
      showInList: true,
    });
    database.setCustomFieldValue(project.projectId, definition.key, "高");

    const listItem = database
      .listProjects()
      .find(item => item.id === project.projectId)!;
    expect(
      listItem.customFields.find(field => field.key === definition.key)
    ).toMatchObject({
      label: "内部优先级",
      value: "高",
      showInList: true,
    });
    expect(database.listProjects({ search: "高" })).toHaveLength(1);
  });
});
