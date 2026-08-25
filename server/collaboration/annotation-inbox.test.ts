import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { remoteFetchMock } = vi.hoisted(() => ({
  remoteFetchMock: vi.fn(),
}));

vi.mock("./remote-fetch", () => ({ remoteFetch: remoteFetchMock }));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cofound-annotations-"));
process.env.COF_BP_DATA_DIR = dataDir;
delete process.env.COF_BP_LITE_REMOTE_URL;
delete process.env.COF_BP_LITE_SYNC_TOKEN;

let publicationId = "";
let projectId = "";

beforeAll(async () => {
  const { importFilePath } = await import("../local/importer");
  const { collaborationAuth } = await import("./auth");
  const { collaborationService } = await import("./service");
  const { drainCollaborationJobs } = await import("./worker");
  const sample = path.resolve("samples/mock-bps/01-星屿智造-天使-v2.md");
  projectId = (await importFilePath(sample)).projectId;
  const { getDatabase } = await import("../local/database");
  const project = getDatabase().getProject(projectId)!;
  const publication = collaborationService.configurePublication({
    projectId,
    shareMode: "fields_only",
    securityMode: "trusted",
    accessMode: "open",
    selectedFields: project.fields
      .filter(field => field.value !== null)
      .slice(0, 3)
      .map(field => field.key),
    selectedFileIds: [],
    expiresAt: null,
    annotationEnabled: true,
    members: [],
    actor: collaborationAuth.ensureLocalAdmin(),
  });
  publicationId = publication.id;
  await drainCollaborationJobs();
  process.env.COF_BP_LITE_REMOTE_URL = "https://lite.example.test";
  process.env.COF_BP_LITE_SYNC_TOKEN = "test-sync-token";
});

afterAll(async () => {
  const { getDatabase } = await import("../local/database");
  getDatabase().close();
  delete process.env.COF_BP_LITE_REMOTE_URL;
  delete process.env.COF_BP_LITE_SYNC_TOKEN;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("Vercel Lite annotation inbox", () => {
  it("retrieves a project-isolated full snapshot with the server-only sync token", async () => {
    const { collaborationService } = await import("./service");
    remoteFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          publicationId,
          projectId,
          projectName: "星屿智造（完全虚构）",
          remoteVersion: 1,
          revision: 4,
          truncated: false,
          fetchedAt: "2026-08-20T08:00:00.000Z",
          annotations: [
            {
              id: crypto.randomUUID(),
              publicationId,
              sourceFileId: null,
              fileName: null,
              fieldKey: null,
              pageNumber: null,
              parentId: null,
              authorName: "Cassian",
              body: "请核对订单真实性。",
              status: "open",
              revision: 4,
              createdAt: "2026-08-20T07:59:00.000Z",
              updatedAt: "2026-08-20T07:59:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result =
      await collaborationService.getPublicationAnnotations(publicationId);
    expect(result.revision).toBe(4);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]).toMatchObject({
      authorName: "Cassian",
      body: "请核对订单真实性。",
    });
    expect(remoteFetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `publicationId=${encodeURIComponent(publicationId)}`
      ),
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer test-sync-token" },
      })
    );
  });

  it("keeps one remote failure visible without failing the whole inbox", async () => {
    const { collaborationService } = await import("./service");
    remoteFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "接口不存在" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );
    const result = await collaborationService.getAnnotationInbox();
    expect(result.publications).toHaveLength(0);
    expect(result.errors).toEqual([
      expect.objectContaining({
        publicationId,
        message: "接口不存在",
      }),
    ]);
  });
});
