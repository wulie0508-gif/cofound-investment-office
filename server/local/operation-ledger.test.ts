import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDatabase } from "./database";
import { OperationLedger } from "./operation-ledger";

let temporaryDirectory = "";
let database: LocalDatabase;
let ledger: OperationLedger;
let tick = 0;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-operation-ledger-")
  );
  database = new LocalDatabase({
    dataDir: temporaryDirectory,
    dbPath: path.join(temporaryDirectory, "test.sqlite"),
  });
  tick = 0;
  ledger = new OperationLedger(database, {
    appVersion: "1.0.1-test",
    clock: () => new Date(Date.UTC(2026, 7, 22, 8, 0, tick++)).toISOString(),
  });
});

afterEach(() => {
  database.close();
  const resolved = path.resolve(temporaryDirectory);
  if (
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("cofound-operation-ledger-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
});

describe("append-only operation ledger", () => {
  it("records a complete analysis lifecycle and supports filtered queries", () => {
    const started = ledger.start({
      operationType: "analysis",
      projectId: "p_demo",
      fileHash: "a".repeat(64),
      actor: { kind: "codex", id: "local-codex", name: "Cassian" },
      skill: { name: "review-early-stage-investment", version: "1.2.0" },
      model: "gpt-5",
      promptVersion: "cofound-analysis/v2",
      metadata: { source: "local", factCount: 19 },
    });
    const completed = ledger.succeed(started.operationId, {
      resultCount: 4,
      durationMs: 3_200,
    });

    expect(completed.status).toBe("succeeded");
    expect(completed.startedAt).toBe(started.startedAt);
    expect(completed.finishedAt).not.toBeNull();
    expect(completed.fileHash).toBe("a".repeat(64));
    expect(completed.metadata).toEqual({
      source: "local",
      factCount: 19,
      resultCount: 4,
      durationMs: 3_200,
    });

    const operation = ledger.getOperation(started.operationId);
    expect(operation?.events.map(event => event.status)).toEqual([
      "started",
      "succeeded",
    ]);
    expect(operation?.summary.eventCount).toBe(2);
    expect(operation?.summary.skill).toEqual({
      name: "review-early-stage-investment",
      version: "1.2.0",
    });

    expect(
      ledger.listOperations({
        operationType: "analysis",
        status: "succeeded",
        projectId: "p_demo",
      })
    ).toHaveLength(1);
    expect(ledger.listOperations({ operationType: "feishu_sync" })).toEqual([]);
    expect(() => ledger.succeed(started.operationId)).toThrow(
      "运维操作已经结束"
    );
  });

  it("keeps the existing collaboration audit table and blocks updates and deletes", () => {
    const tables = database.connection
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('audit_events','operation_ledger') ORDER BY name"
      )
      .all()
      .map(row => String((row as { name: string }).name));
    expect(tables).toEqual(["audit_events", "operation_ledger"]);
    expect(
      database.connection
        .prepare("SELECT value FROM app_settings WHERE key = 'schema_version'")
        .get()
    ).toEqual({ value: "11" });

    const started = ledger.start({
      operationType: "import",
      actor: { kind: "system", id: "local-importer" },
      metadata: { discovered: 3 },
    });
    expect(() =>
      database.connection
        .prepare(
          "UPDATE operation_ledger SET status = 'failed' WHERE operation_id = ?"
        )
        .run(started.operationId)
    ).toThrow(/append-only/u);
    expect(() =>
      database.connection
        .prepare("DELETE FROM operation_ledger WHERE operation_id = ?")
        .run(started.operationId)
    ).toThrow(/append-only/u);
  });

  it("rejects document bodies and credential-shaped metadata before writing", () => {
    expect(() =>
      ledger.start({
        operationType: "feishu_sync",
        actor: { kind: "codex", id: "sync-agent" },
        metadata: { accessToken: "never-store-this" },
      })
    ).toThrow(/禁止记录敏感字段/u);
    expect(() =>
      ledger.start({
        operationType: "import",
        actor: { kind: "system", id: "importer" },
        metadata: { result: { bpText: "这是 BP 正文" } },
      })
    ).toThrow(/禁止记录敏感字段/u);

    const count = database.connection
      .prepare("SELECT COUNT(*) AS count FROM operation_ledger")
      .get() as {
      count: number;
    };
    expect(Number(count.count)).toBe(0);
  });

  it("redacts secrets from failure summaries and validates SHA-256 hashes", () => {
    expect(() =>
      ledger.start({
        operationType: "external_share",
        fileHash: "not-a-sha256",
        actor: { kind: "human", id: "maintainer" },
      })
    ).toThrow(/64 位 SHA-256/u);

    const started = ledger.start({
      operationType: "external_share",
      actor: { kind: "human", id: "maintainer" },
      metadata: { endpoint: "vercel-lite" },
    });
    const failed = ledger.fail(started.operationId, {
      code: "REMOTE_AUTH_FAILED",
      message: "Bearer super-secret sync_token=abc123 验证码：123456",
    });

    const serialized = JSON.stringify(failed);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("123456");
    expect(serialized).toContain("REDACTED");
    expect(failed.error?.code).toBe("REMOTE_AUTH_FAILED");
  });
});
