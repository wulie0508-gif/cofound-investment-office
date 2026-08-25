import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CodexInvestmentAnalysisResult } from "../../shared/bp";
import { codexInvestmentAnalysisResultSchema } from "./codex-analysis-schema";
import {
  completeCodexAnalysis,
  prepareCodexAnalysis,
} from "./codex-analysis-service";
import { LocalDatabase } from "./database";
import { extractDocument } from "./extractor";
import { importFilePath } from "./importer";
import { OperationLedger } from "./operation-ledger";

const samples = path.resolve(process.cwd(), "samples", "mock-bps");
let temporaryDirectory = "";
let database: LocalDatabase;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-codex-analysis-")
  );
  database = new LocalDatabase({
    dataDir: temporaryDirectory,
    dbPath: path.join(temporaryDirectory, "test.sqlite"),
  });
});

afterEach(() => {
  database.close();
  const resolved = path.resolve(temporaryDirectory);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-codex-analysis-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
});

function resultFor(
  prepared: ReturnType<LocalDatabase["prepareCodexAnalysis"]>
): CodexInvestmentAnalysisResult {
  const fact = prepared.factSnapshot.facts.find(
    item => item.evidence?.page && item.evidence.quote
  );
  if (!fact?.evidence?.page || !fact.evidence.quote)
    throw new Error("测试样本缺少可引用证据");
  return {
    schemaVersion: "1.0",
    summary: "现有商业证据支持继续核实，但关键合同与回款口径仍需确认。",
    positiveSignals: [
      {
        title: "已有可定位的商业事实",
        detail: "材料披露了可回到原文复核的经营信息。",
        basis: "evidence",
        evidence: [
          {
            fieldKey: fact.key,
            page: fact.evidence.page,
            quote: fact.evidence.quote,
          },
        ],
      },
    ],
    keyRisks: [
      {
        title: "回款证据仍不完整",
        detail: "现有材料不足以确认全部订单均已形成现金回款。",
        basis: "inference",
        evidence: [],
      },
    ],
    frameworkSections: [
      {
        key: "commercial_evidence",
        title: "商业证据",
        assessment: "mixed",
        detail: "存在经营信号，但回款闭环仍需核实。",
        evidence: [
          {
            fieldKey: fact.key,
            page: fact.evidence.page,
            quote: fact.evidence.quote,
          },
        ],
        counterarguments: ["单一材料可能无法反映合同最新状态。"],
        unresolvedQuestions: ["已验收和已回款金额分别是多少？"],
      },
    ],
    unresolvedQuestions: ["订单、交付、验收、开票和回款分别是多少？"],
    nextActions: ["核验合同、验收单和银行流水的对应关系。"],
    aiSuggestion: "已完成初筛",
    confidence: "medium",
  };
}

describe("Codex investment analysis lifecycle", () => {
  it("records a successful retry when a prepared run recovers from invalid evidence", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const ledger = new OperationLedger(database);
    const prepared = prepareCodexAnalysis(
      {
        projectId: imported.projectId,
        skillName: "review-early-stage-investment",
        requestedBy: "Cassian",
      },
      database,
      ledger
    );
    const invalid = resultFor(prepared);
    invalid.positiveSignals[0].evidence[0].quote = "不存在于快照的引文";
    expect(() =>
      completeCodexAnalysis(
        { runId: prepared.id, modelName: "Codex test", result: invalid },
        database,
        ledger
      )
    ).toThrow("证据短引文不在冻结的事实快照中");

    const completed = completeCodexAnalysis(
      {
        runId: prepared.id,
        modelName: "Codex test",
        result: resultFor(prepared),
      },
      database,
      ledger
    );
    expect(completed.status).toBe("completed");
    const attempts = ledger
      .listOperations({
        operationType: "analysis",
        projectId: imported.projectId,
        limit: 20,
      })
      .filter(item => item.metadata.analysisRunId === prepared.id);
    expect(attempts.map(item => item.status).sort()).toEqual([
      "failed",
      "succeeded",
    ]);
    expect(
      attempts.find(item => item.status === "succeeded")?.metadata.retryOf
    ).toBe(`codex_analysis_${prepared.id}`);

    completeCodexAnalysis(
      {
        runId: prepared.id,
        modelName: "Codex test",
        result: resultFor(prepared),
      },
      database,
      ledger
    );
    expect(
      ledger
        .listOperations({
          operationType: "analysis",
          projectId: imported.projectId,
          limit: 20,
        })
        .filter(item => item.metadata.analysisRunId === prepared.id)
    ).toHaveLength(2);
  });

  it("freezes facts, saves a grounded result and preserves human management status", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const prepared = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "review-early-stage-investment",
      requestedBy: "Cassian",
    });
    const reused = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "review-early-stage-investment",
      requestedBy: "Cassian",
    });

    expect(reused.id).toBe(prepared.id);
    expect(prepared.status).toBe("prepared");
    expect(prepared.sourceFileSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepared.factSnapshotHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(prepared.factSnapshot)).not.toContain("storedPath");
    expect(JSON.stringify(prepared.factSnapshot)).not.toContain(
      "managementStatus"
    );

    database.updateManagementStatus(
      imported.projectId,
      "持续跟踪",
      true,
      "负责人决定"
    );
    database.updateShareMode(imported.projectId, "fields_only");
    expect(database.listCodexAnalysisRuns(imported.projectId)[0].status).toBe(
      "prepared"
    );

    const result = resultFor(prepared);
    const completed = database.completeCodexAnalysis({
      runId: prepared.id,
      modelName: "Codex desktop session",
      result,
    });
    expect(completed.status).toBe("completed");
    expect(completed.result).toEqual(result);
    expect(completed.requestedBy).toBe("Cassian");

    const idempotent = database.completeCodexAnalysis({
      runId: prepared.id,
      modelName: "Codex desktop session",
      result,
    });
    expect(idempotent.id).toBe(prepared.id);
    expect(() =>
      database.completeCodexAnalysis({
        runId: prepared.id,
        modelName: "Codex desktop session",
        result: { ...result, summary: "试图覆盖历史结果" },
      })
    ).toThrow("不能覆盖历史结果");

    const project = database.getProject(imported.projectId)!;
    expect(project.managementStatus).toBe("持续跟踪");
    expect(project.statusLocked).toBe(true);
    expect(project.codexAnalyses[0].status).toBe("completed");
  });

  it("does not reuse prepared work across operators, force runs or prompt identities", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const first = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "assess-long-term-value",
      requestedBy: "Cassian",
    });
    const otherOperator = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "assess-long-term-value",
      requestedBy: "Maya",
    });
    const forced = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "assess-long-term-value",
      requestedBy: "Cassian",
      force: true,
    });
    expect(new Set([first.id, otherOperator.id, forced.id]).size).toBe(3);
    expect(() =>
      database.prepareCodexAnalysis({
        projectId: imported.projectId,
        skillName: "assess-long-term-value",
        requestedBy: "   ",
      })
    ).toThrow("必须记录操作者");
    expect(() =>
      database.completeCodexAnalysis({
        runId: first.id,
        modelName: "   ",
        result: resultFor(first),
      })
    ).toThrow("必须记录模型名称");
  });

  it("keeps a run current after an identical deterministic refresh", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const project = database.getProject(imported.projectId)!;
    const prepared = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "review-early-stage-investment",
      requestedBy: "Cassian",
    });
    database.saveAnalysis(
      imported.projectId,
      project.files[0].id,
      "analysis-identical-refresh",
      project.analysis!,
      project.recommendations
    );
    expect(database.listCodexAnalysisRuns(imported.projectId)[0].id).toBe(
      prepared.id
    );
    expect(database.listCodexAnalysisRuns(imported.projectId)[0].status).toBe(
      "prepared"
    );
  });

  it("accepts narrative evidence only after reading pages bound to the run", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const prepared = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "assess-market-first",
      requestedBy: "Cassian",
    });
    const source = database.getPreparedCodexAnalysisSource(prepared.id);
    const extraction = await extractDocument(
      fs.readFileSync(source.storedPath),
      source.originalName,
      source.mimeType
    );
    const page = extraction.pages.find(item => item.text.length > 20)!;
    database.recordPreparedCodexAnalysisPages(prepared.id, [page]);
    const result = resultFor(prepared);
    result.frameworkSections[0].evidence = [
      {
        fieldKey: null,
        page: page.page,
        quote: page.text.slice(0, 20),
      },
    ];
    expect(
      database.completeCodexAnalysis({
        runId: prepared.id,
        modelName: "Codex desktop session",
        result,
      }).status
    ).toBe("completed");
  });

  it("rejects incomplete structured results before persistence", () => {
    expect(
      codexInvestmentAnalysisResultSchema.safeParse({
        schemaVersion: "1.0",
        summary: "缺少框架分区",
        positiveSignals: [],
        keyRisks: [],
        unresolvedQuestions: [],
        nextActions: [],
        aiSuggestion: "已完成初筛",
        confidence: "low",
      }).success
    ).toBe(false);
  });

  it("rejects evidence that is absent from the frozen snapshot", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const prepared = database.prepareCodexAnalysis({
      projectId: imported.projectId,
      skillName: "assess-market-first",
      requestedBy: "Cassian",
    });
    const result = resultFor(prepared);
    result.positiveSignals[0].evidence[0] = {
      fieldKey: "invented_metric",
      page: 9999,
      quote: "材料中不存在的引文",
    };

    expect(() =>
      database.completeCodexAnalysis({
        runId: prepared.id,
        modelName: "Codex desktop session",
        result,
      })
    ).toThrow("不在冻结的事实快照中");
    expect(database.listCodexAnalysisRuns(imported.projectId)[0].status).toBe(
      "prepared"
    );
  });

  it("marks an unfinished judgment stale when a new BP version arrives", async () => {
    const v1 = await importFilePath(
      path.join(samples, "01-星屿智造-天使-v1.md"),
      {},
      database
    );
    const prepared = database.prepareCodexAnalysis({
      projectId: v1.projectId,
      skillName: "assess-founder-first",
      requestedBy: "Cassian",
    });
    const result = resultFor(prepared);

    await importFilePath(
      path.join(samples, "01-星屿智造-天使-v2.md"),
      {},
      database
    );

    const stale = database.listCodexAnalysisRuns(v1.projectId)[0];
    expect(stale.status).toBe("stale");
    expect(stale.staleReason).toContain("原文件版本");
    expect(() =>
      database.completeCodexAnalysis({
        runId: prepared.id,
        modelName: "Codex desktop session",
        result,
      })
    ).toThrow("已失效");
  });
});
