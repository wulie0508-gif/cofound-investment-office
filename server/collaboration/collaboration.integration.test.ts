import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "cofound-collaboration-")
);
process.env.COF_BP_DATA_DIR = dataDir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;

let projectId = "";
let publicationId = "";
const externalUser = {
  id: crypto.randomUUID(),
  email: "guest@example.com",
  name: "外部测试人",
  role: "external" as const,
  state: "active" as const,
  languagePreference: "bilingual" as const,
};

beforeAll(async () => {
  const { importFilePath } = await import("../local/importer");
  const sample = path.resolve("samples/mock-bps/01-星屿智造-天使-v2.md");
  const result = await importFilePath(sample);
  projectId = result.projectId;
});

afterAll(async () => {
  const { getDatabase } = await import("../local/database");
  getDatabase().close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("controlled collaboration flow", () => {
  it("binds an invited collaborator through a local email OTP", async () => {
    const { collaborationAuth } = await import("./auth");
    const admin = collaborationAuth.ensureLocalAdmin();
    const email = "otp-collaborator@example.com";
    collaborationAuth.createInvitation({
      email,
      name: "邮箱验证协作者",
      role: "external",
      createdBy: admin.id,
      baseUrl: "http://127.0.0.1:4010",
    });
    const request = {
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      get: () => "vitest",
      headers: {},
    } as unknown as Request;
    const response = {
      setHeader: vi.fn(),
    } as unknown as Response;
    const delivery = await collaborationAuth.requestEmailOtp(
      { email },
      request
    );
    expect(delivery.delivery).toBe("local_preview");
    expect(delivery.previewCode).toMatch(/^\d{6}$/u);
    const user = await collaborationAuth.verifyEmailOtp(
      { email, token: delivery.previewCode! },
      request,
      response
    );
    expect(user).toMatchObject({
      email,
      name: "邮箱验证协作者",
      role: "external",
      state: "active",
      languagePreference: "bilingual",
    });
    const updated = collaborationAuth.updateProfile(user.id, {
      languagePreference: "en",
    });
    expect(updated.languagePreference).toBe("en");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("cofound_share_session")
    );
  });

  it("publishes a selected snapshot and enforces project membership", async () => {
    const { getDatabase } = await import("../local/database");
    const { collaborationAuth } = await import("./auth");
    const { collaborationService } = await import("./service");
    const { drainCollaborationJobs } = await import("./worker");
    const database = getDatabase();
    const admin = collaborationAuth.ensureLocalAdmin();
    const timestamp = new Date().toISOString();
    database.connection
      .prepare(
        `
      INSERT INTO collaboration_users(id, email, name, role, state, created_at, updated_at)
      VALUES (?, ?, ?, 'external', 'active', ?, ?)
    `
      )
      .run(
        externalUser.id,
        externalUser.email,
        externalUser.name,
        timestamp,
        timestamp
      );
    const project = database.getProject(projectId)!;
    const fields = project.fields
      .filter(field => field.value !== null)
      .slice(0, 8)
      .map(field => field.key);
    const fileId = project.files[0].id;
    const publication = collaborationService.configurePublication({
      projectId,
      shareMode: "selected_files",
      securityMode: "high_security",
      selectedFields: fields,
      selectedFileIds: [fileId],
      expiresAt: null,
      members: [
        {
          userId: externalUser.id,
          canViewFields: true,
          canViewFiles: true,
          canRequestDownload: true,
        },
      ],
      actor: admin,
    });
    publicationId = publication.id;
    const result = await drainCollaborationJobs();
    expect(result.processed).toBeGreaterThanOrEqual(2);
    const published = collaborationService.getPublication(publicationId)!;
    expect(published.state).toBe("published");
    expect(published.syncState).toBe("synced");
    expect(published.verification).toHaveLength(fields.length);
    const { OperationLedger } = await import("../local/operation-ledger");
    const shareOperations = new OperationLedger(database).listOperations({
      operationType: "external_share",
      projectId,
    });
    const configuration = shareOperations.find(
      operation => operation.metadata.phase === "configuration"
    );
    const delivery = shareOperations.find(
      operation => operation.metadata.phase === "delivery"
    );
    expect(configuration).toMatchObject({
      status: "succeeded",
      actor: { kind: "human", id: admin.id, name: admin.name },
    });
    expect(configuration?.metadata).toMatchObject({
      configurationAction: "created",
      publicationId,
      selectedFileCount: 1,
      memberCount: 1,
    });
    expect(delivery).toMatchObject({
      status: "succeeded",
      actor: { kind: "human", id: admin.id, name: admin.name },
    });
    expect(delivery?.metadata).toMatchObject({
      publicationId,
      syncState: "synced",
    });
    const portalProject = collaborationService.getPortalProject(
      externalUser,
      publicationId
    );
    expect(portalProject.fields).toHaveLength(fields.length);
    expect(portalProject.files).toHaveLength(1);
    expect(() =>
      collaborationService.getPortalProject(
        { ...externalUser, id: crypto.randomUUID() },
        publicationId
      )
    ).toThrow(/没有访问/);
  });

  it("closes rejected publication configuration attempts without sensitive metadata", async () => {
    const { getDatabase } = await import("../local/database");
    const { OperationLedger } = await import("../local/operation-ledger");
    const { collaborationAuth } = await import("./auth");
    const { collaborationService } = await import("./service");
    const project = getDatabase().getProject(projectId)!;
    expect(() =>
      collaborationService.configurePublication({
        projectId,
        shareMode: "fields_only",
        securityMode: "high_security",
        accessMode: "passcode",
        accessCode: "135790",
        selectedFields: [project.fields[0].key],
        selectedFileIds: [project.files[0].id],
        expiresAt: null,
        members: [],
        actor: collaborationAuth.ensureLocalAdmin(),
      })
    ).toThrow(/不能选择文件/u);
    const failed = new OperationLedger(getDatabase())
      .listOperations({
        operationType: "external_share",
        projectId,
        status: "failed",
      })
      .find(operation => operation.metadata.phase === "configuration");
    expect(failed?.error?.code).toBe("EXTERNAL_SHARE_CONFIGURATION_FAILED");
    const serialized = JSON.stringify(failed);
    expect(serialized).not.toContain("135790");
    expect(serialized).not.toContain(externalUser.email);
  });

  it("requires approval and produces a burned-in watermarked PDF", async () => {
    const { collaborationAuth } = await import("./auth");
    const { collaborationService } = await import("./service");
    const { buildWatermarkedReviewPdf } = await import("./watermark");
    const admin = collaborationAuth.ensureLocalAdmin();
    const portal = collaborationService.getPortalProject(
      externalUser,
      publicationId
    );
    const fileId = portal.files[0].id;
    const request = collaborationService.createDownloadRequest(
      externalUser,
      publicationId,
      fileId,
      "供测试顾问审阅商业条款"
    );
    expect(request.state).toBe("pending");
    const approved = collaborationService.decideDownload({
      id: request.id,
      approve: true,
      note: "仅限本次测试",
      actor: admin,
    });
    expect(approved.state).toBe("approved");
    const link = collaborationService.createDownloadLink(
      externalUser,
      request.id,
      "http://127.0.0.1:4010"
    );
    const token = link.url.split("/").pop()!;
    const shared = collaborationService.consumeDownload(externalUser, token);
    const pdf = await buildWatermarkedReviewPdf({
      absolutePath: shared.absolutePath,
      mimeType: String(shared.row.mime_type),
      pageCount: Number(shared.row.page_count),
      textPages: collaborationService.fileTextPages(shared.row),
      identity: {
        name: externalUser.name,
        email: externalUser.email,
        viewedAt: new Date().toISOString(),
        reference: request.id,
      },
    });
    collaborationService.completeDownload(externalUser, {
      tokenId: shared.downloadTokenId,
      requestId: shared.downloadRequestId,
      fileId: String(shared.row.id),
      publicationId,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(collaborationService.getDownloadRequest(request.id)?.state).toBe(
      "downloaded"
    );
  }, 20_000);

  it("protects a project link with a hashed six digit access code", async () => {
    const { getDatabase } = await import("../local/database");
    const { collaborationAuth } = await import("./auth");
    const { collaborationService } = await import("./service");
    const { drainCollaborationJobs } = await import("./worker");
    const { SHARE_ACCESS_COOKIE } = await import("./access-code");
    const current = collaborationService.getPublication(publicationId)!;
    const publication = collaborationService.configurePublication({
      projectId,
      shareMode: current.shareMode,
      securityMode: current.securityMode,
      accessMode: "passcode",
      accessCode: "240815",
      selectedFields: current.selectedFields,
      selectedFileIds: current.selectedFileIds,
      expiresAt: null,
      annotationEnabled: true,
      members: [],
      actor: collaborationAuth.ensureLocalAdmin(),
    });
    await drainCollaborationJobs();
    const stored = getDatabase()
      .connection.prepare(
        "SELECT access_code_hash FROM publications WHERE id = ?"
      )
      .get(publication.id) as { access_code_hash: string };
    expect(stored.access_code_hash).not.toContain("240815");
    const unauthenticatedRequest = {
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      headers: {},
    } as unknown as Request;
    expect(
      collaborationService.getLinkAuthStatus(
        publication.shareToken,
        unauthenticatedRequest
      )
    ).toMatchObject({
      accessMode: "passcode",
      required: true,
      authenticated: false,
    });
    expect(() =>
      collaborationService.getLinkShare(
        publication.shareToken,
        unauthenticatedRequest
      )
    ).toThrow(/6 位访问码/u);
    const session = collaborationService.verifyLinkAccessCode(
      publication.shareToken,
      "240815",
      unauthenticatedRequest
    );
    const request = {
      ...unauthenticatedRequest,
      headers: { cookie: `${SHARE_ACCESS_COOKIE}=${session}` },
    } as unknown as Request;
    const shared = collaborationService.getLinkShare(
      publication.shareToken,
      request
    );
    expect(shared.publicationId).toBe(publicationId);
    expect(shared.downloadEnabled).toBe(false);
    expect(shared.files[0].canRequestDownload).toBe(false);
    expect(shared.files[0].viewerUrl).toContain("action=file");

    const created = collaborationService.createLinkAnnotation(
      publication.shareToken,
      {
        authorName: "协作测试人",
        body: "请核对这项收入是否已经形成真实回款。",
        fieldKey: shared.fields[0].key,
      },
      request
    );
    expect(created.revision).toBe(1);
    const synchronized = collaborationService.listLinkAnnotations(
      publication.shareToken,
      0,
      request
    );
    expect(synchronized.revision).toBe(1);
    expect(synchronized.annotations).toHaveLength(1);

    const resolved = collaborationService.resolveLinkAnnotation(
      publication.shareToken,
      created.id,
      true,
      request
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.revision).toBe(2);
    expect(
      collaborationService.getLinkSharedFile(
        publication.shareToken,
        shared.files[0].id,
        request
      ).absolutePath
    ).toMatch(/shared-files/u);
  });
});
