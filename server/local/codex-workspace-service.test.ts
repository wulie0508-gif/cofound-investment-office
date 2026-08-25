import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDatabase } from "./database";
import { importFilePath } from "./importer";
import { openCodexProjectWorkspace } from "./codex-workspace-service";

const samples = path.resolve(process.cwd(), "samples", "mock-bps");
let temporaryDirectory = "";
let database: LocalDatabase;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cofound-codex-workspace-")
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
    path.basename(resolved).startsWith("cofound-codex-workspace-")
  )
    fs.rmSync(resolved, { recursive: true, force: true });
});

describe("Codex project workspace service", () => {
  it("validates the project and returns the stable openProject contract", async () => {
    const imported = await importFilePath(
      path.join(samples, "02-澄川能源-Pre-A.md"),
      {},
      database
    );
    const launcher = vi.fn(async () => ({
      threadId: "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a",
      launched: true,
      error: null,
      recoverable: true,
    }));

    await expect(
      openCodexProjectWorkspace(
        {
          projectId: imported.projectId,
          requestedBy: "Cassian",
        },
        database,
        launcher
      )
    ).resolves.toEqual({
      threadId: "01991b65-0bd7-7f40-a10d-3f52e0b9bc4a",
      launched: true,
      error: null,
      recoverable: true,
    });
    expect(launcher).toHaveBeenCalledWith({ projectId: imported.projectId });
  });

  it("does not launch a conversation for an unknown project", async () => {
    const launcher = vi.fn();
    await expect(
      openCodexProjectWorkspace(
        { projectId: "p_missing-project", requestedBy: "Cassian" },
        database,
        launcher
      )
    ).rejects.toThrow("项目不存在");
    expect(launcher).not.toHaveBeenCalled();
  });
});
