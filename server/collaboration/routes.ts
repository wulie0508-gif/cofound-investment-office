import fs from "node:fs";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  SECURITY_MODES,
  SHARE_ACCESS_MODES,
  UI_LANGUAGE_PREFERENCES,
} from "../../shared/collaboration";
import { collaborationAuth, AuthError } from "./auth";
import { collaborationService } from "./service";
import { buildWatermarkedReviewPdf, renderSecurePage } from "./watermark";
import { drainCollaborationJobs } from "./worker";
import {
  SHARE_ACCESS_COOKIE,
  SHARE_ACCESS_SESSION_MAX_AGE_SECONDS,
} from "./access-code";

const passwordSchema = z.string().min(10).max(200);
const idSchema = z.string().uuid();
const resourceIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

function baseUrl(request: Request) {
  return (
    process.env.COF_BP_PUBLIC_BASE_URL?.trim() ||
    `${request.protocol}://${request.get("host")}`
  );
}

function handler(
  work: (request: Request, response: Response) => unknown | Promise<unknown>
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      await work(request, response);
    } catch (error) {
      next(error);
    }
  };
}

export function registerCollaborationRoutes(app: Express) {
  app.get(
    "/api/lite",
    handler((request, response) => {
      const action = z
        .enum(["health", "auth-status", "share", "comments", "file"])
        .parse(request.query.action);
      if (action === "health") {
        response.json({ ok: true, runtime: "local-lite" });
        return;
      }
      const token = z.string().min(20).max(200).parse(request.query.token);
      if (action === "auth-status") {
        response.setHeader("Cache-Control", "private, no-store");
        response.json(collaborationService.getLinkAuthStatus(token, request));
        return;
      }
      if (action === "share") {
        response.setHeader("Cache-Control", "private, no-store");
        response.json(collaborationService.getLinkShare(token, request));
        return;
      }
      if (action === "comments") {
        const after = z.coerce
          .number()
          .int()
          .min(0)
          .default(0)
          .parse(request.query.after);
        response.setHeader("Cache-Control", "private, no-store");
        response.json(
          collaborationService.listLinkAnnotations(token, after, request)
        );
        return;
      }
      const fileId = resourceIdSchema.parse(request.query.fileId);
      const file = collaborationService.getLinkSharedFile(
        token,
        fileId,
        request
      );
      if (!fs.existsSync(file.absolutePath))
        throw new AuthError("共享文件缺失", 404);
      const fileName = String(file.row.original_name).replace(/[\r\n"]/g, "_");
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      response.setHeader("Content-Type", String(file.row.mime_type));
      response.setHeader("X-Download-Options", "noopen");
      response.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      response.sendFile(file.absolutePath);
    })
  );

  app.post(
    "/api/lite",
    handler(async (request, response) => {
      const action = z
        .enum([
          "passcode-verify",
          "otp-request",
          "otp-verify",
          "comment",
          "resolve",
        ])
        .parse(request.query.action);
      const token = z.string().min(20).max(200).parse(request.query.token);
      if (action === "passcode-verify") {
        const input = z
          .object({ accessCode: z.string().regex(/^\d{6}$/u) })
          .parse(request.body);
        const session = collaborationService.verifyLinkAccessCode(
          token,
          input.accessCode,
          request
        );
        response.cookie(SHARE_ACCESS_COOKIE, session, {
          httpOnly: true,
          sameSite: "strict",
          secure:
            request.secure || request.get("x-forwarded-proto") === "https",
          path: "/",
          maxAge: SHARE_ACCESS_SESSION_MAX_AGE_SECONDS * 1000,
        });
        response.json({ ok: true, accessMode: "passcode" });
        return;
      }
      if (action === "otp-request") {
        const input = z
          .object({ email: z.string().email().max(200) })
          .parse(request.body);
        collaborationService.assertLinkMemberEmail(token, input.email);
        response.json(
          await collaborationAuth.requestEmailOtp(
            { email: input.email },
            request
          )
        );
        return;
      }
      if (action === "otp-verify") {
        const input = z
          .object({
            email: z.string().email().max(200),
            token: z
              .string()
              .trim()
              .regex(/^\d{6}$/u),
          })
          .parse(request.body);
        collaborationService.assertLinkMemberEmail(token, input.email);
        const viewer = await collaborationAuth.verifyEmailOtp(
          input,
          request,
          response
        );
        response.json({ viewer });
        return;
      }
      if (action === "comment") {
        const input = z
          .object({
            authorName: z.string().trim().min(1).max(80),
            authorEmail: z.string().email().max(200).nullable().optional(),
            body: z.string().trim().min(1).max(2000),
            fileId: resourceIdSchema.nullable().optional(),
            fieldKey: z.string().trim().min(1).max(100).nullable().optional(),
            pageNumber: z.number().int().min(1).max(1000).nullable().optional(),
            parentId: idSchema.nullable().optional(),
          })
          .parse(request.body);
        response
          .status(201)
          .json(
            collaborationService.createLinkAnnotation(token, input, request)
          );
        return;
      }
      const input = z
        .object({ annotationId: idSchema, resolved: z.boolean() })
        .parse(request.body);
      response.json(
        collaborationService.resolveLinkAnnotation(
          token,
          input.annotationId,
          input.resolved,
          request
        )
      );
    })
  );

  app.get("/api/auth/session", (request, response) =>
    response.json({ user: collaborationAuth.getSession(request) })
  );

  app.get("/api/auth/email/status", (request, response) =>
    response.json(collaborationAuth.emailOtpStatus(request))
  );

  app.post(
    "/api/auth/email/request",
    handler(async (request, response) => {
      const input = z
        .object({
          email: z.string().email().max(200),
          name: z.string().trim().min(1).max(80).optional(),
        })
        .parse(request.body);
      response.json(await collaborationAuth.requestEmailOtp(input, request));
    })
  );

  app.post(
    "/api/auth/email/verify",
    handler(async (request, response) => {
      const input = z
        .object({
          email: z.string().email().max(200),
          token: z
            .string()
            .trim()
            .regex(/^\d{6}$/u),
          name: z.string().trim().min(1).max(80).optional(),
        })
        .parse(request.body);
      const user = await collaborationAuth.verifyEmailOtp(
        input,
        request,
        response
      );
      collaborationService.audit(
        user,
        "session.email_otp_verified",
        "session",
        null,
        { provider: collaborationAuth.emailOtpStatus(request).mode },
        request
      );
      response.json({ user });
    })
  );

  app.patch(
    "/api/auth/profile",
    handler((request, response) => {
      const actor = collaborationAuth.requireSession(request);
      const input = z
        .object({
          name: z.string().trim().min(1).max(80).optional(),
          languagePreference: z.enum(UI_LANGUAGE_PREFERENCES).optional(),
        })
        .refine(
          value =>
            value.name !== undefined || value.languagePreference !== undefined,
          { message: "没有需要更新的账户信息" }
        )
        .parse(request.body);
      const user = collaborationAuth.updateProfile(actor.id, input);
      collaborationService.audit(
        user,
        input.name !== undefined
          ? input.languagePreference !== undefined
            ? "profile.updated"
            : "profile.name_updated"
          : "profile.language_updated",
        "user",
        user.id,
        {
          nameChanged: input.name !== undefined,
          languagePreference: input.languagePreference ?? null,
        },
        request
      );
      response.json({ user });
    })
  );

  app.post(
    "/api/auth/local-admin",
    handler((request, response) => {
      const user = collaborationAuth.bootstrapLocalAdmin(request, response);
      collaborationService.audit(
        user,
        "session.local_admin_started",
        "session",
        null,
        {},
        request
      );
      response.json({ user });
    })
  );

  app.post(
    "/api/auth/login",
    handler((request, response) => {
      const input = z
        .object({
          email: z.string().email(),
          password: z.string().min(1).max(200),
        })
        .parse(request.body);
      const user = collaborationAuth.login(
        input.email,
        input.password,
        request,
        response
      );
      collaborationService.audit(
        user,
        "session.login",
        "session",
        null,
        {},
        request
      );
      response.json({ user });
    })
  );

  app.post(
    "/api/auth/logout",
    handler((request, response) => {
      const user = collaborationAuth.getSession(request);
      collaborationAuth.logout(request, response);
      collaborationService.audit(
        user,
        "session.logout",
        "session",
        null,
        {},
        request
      );
      response.json({ ok: true });
    })
  );

  app.post(
    "/api/auth/invitations/:token/accept",
    handler((request, response) => {
      const input = z.object({ password: passwordSchema }).parse(request.body);
      const user = collaborationAuth.acceptInvitation(
        request.params.token,
        input.password,
        request,
        response
      );
      collaborationService.audit(
        user,
        "invitation.accepted",
        "user",
        user.id,
        {},
        request
      );
      response.json({ user });
    })
  );

  app.get(
    "/api/collaboration/overview",
    handler((request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.json(collaborationService.getOverview());
    })
  );

  app.get(
    "/api/collaboration/users",
    handler((request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.json(collaborationAuth.listCollaborators());
    })
  );

  app.get(
    "/api/collaboration/invitations",
    handler((request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.json(collaborationAuth.listInvitations());
    })
  );

  app.post(
    "/api/collaboration/invitations",
    handler((request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      const input = z
        .object({
          email: z.string().email(),
          name: z.string().trim().min(1).max(100),
          role: z.enum(["internal", "external"]),
        })
        .parse(request.body);
      const invitation = collaborationAuth.createInvitation({
        ...input,
        createdBy: actor.id,
        baseUrl: baseUrl(request),
      });
      collaborationService.audit(
        actor,
        "invitation.created",
        "invitation",
        invitation.id,
        { email: invitation.email, role: invitation.role },
        request
      );
      response.status(201).json(invitation);
    })
  );

  app.post(
    "/api/collaboration/invitations/:id/revoke",
    handler((request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      collaborationAuth.revokeInvitation(request.params.id);
      collaborationService.audit(
        actor,
        "invitation.revoked",
        "invitation",
        request.params.id,
        {},
        request
      );
      response.json({ ok: true });
    })
  );

  app.patch(
    "/api/collaboration/users/:id",
    handler((request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      const input = z
        .object({ state: z.enum(["active", "suspended"]) })
        .parse(request.body);
      const user = collaborationAuth.setUserState(
        request.params.id,
        input.state
      );
      collaborationService.audit(
        actor,
        input.state === "suspended" ? "user.suspended" : "user.activated",
        "user",
        user.id,
        {},
        request
      );
      response.json(user);
    })
  );

  app.get(
    "/api/collaboration/publications",
    handler((request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.json(collaborationService.listPublications());
    })
  );

  app.get(
    "/api/collaboration/annotations",
    handler(async (request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.setHeader("Cache-Control", "private, no-store");
      response.json(await collaborationService.getAnnotationInbox());
    })
  );

  app.get(
    "/api/collaboration/publications/:id/annotations",
    handler(async (request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.setHeader("Cache-Control", "private, no-store");
      response.json(
        await collaborationService.getPublicationAnnotations(request.params.id)
      );
    })
  );

  app.get(
    "/api/collaboration/publications/:id",
    handler((request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      const publication = collaborationService.getPublication(
        request.params.id
      );
      if (!publication) throw new AuthError("共享项目不存在", 404);
      response.json(publication);
    })
  );

  app.put(
    "/api/collaboration/projects/:projectId/publication",
    handler((request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      const input = z
        .object({
          shareMode: z.enum(["fields_only", "selected_files"]),
          securityMode: z.enum(SECURITY_MODES),
          accessMode: z.enum(SHARE_ACCESS_MODES).optional(),
          accessCode: z
            .string()
            .regex(/^\d{6}$/u)
            .optional(),
          selectedFields: z.array(z.string().min(1).max(100)).max(100),
          selectedFileIds: z.array(resourceIdSchema).max(100),
          expiresAt: z.string().datetime().nullable(),
          annotationEnabled: z.boolean().default(true),
          members: z
            .array(
              z.object({
                userId: idSchema,
                canViewFields: z.boolean(),
                canViewFiles: z.boolean(),
                canRequestDownload: z.boolean(),
              })
            )
            .max(100),
        })
        .parse(request.body);
      const publication = collaborationService.configurePublication({
        ...input,
        projectId: request.params.projectId,
        actor,
        request,
      });
      response.json(publication);
    })
  );

  app.post(
    "/api/collaboration/publications/:id/sync",
    handler(async (request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      const job = collaborationService.syncPublication(
        request.params.id,
        actor,
        request
      );
      await drainCollaborationJobs();
      response.status(202).json({
        ...job,
        publication: collaborationService.getPublication(request.params.id),
      });
    })
  );

  app.post(
    "/api/collaboration/publications/:id/pause",
    handler(async (request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      response.json(
        await collaborationService.pausePublication(
          request.params.id,
          actor,
          request
        )
      );
    })
  );

  app.get(
    "/api/collaboration/jobs",
    handler((request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.json(collaborationService.listJobs());
    })
  );

  app.post(
    "/api/collaboration/jobs/:id/retry",
    handler(async (request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      const job = collaborationService.retryJob(
        request.params.id,
        actor,
        request
      );
      await drainCollaborationJobs();
      response.json({
        ...job,
        current: collaborationService
          .listJobs()
          .find(item => item.id === job.id),
      });
    })
  );

  app.get(
    "/api/collaboration/audit",
    handler((request, response) => {
      collaborationAuth.requireSession(request, ["admin"]);
      response.json(
        collaborationService.listAudit(Number(request.query.limit ?? 100))
      );
    })
  );

  app.get(
    "/api/collaboration/download-requests",
    handler((request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      response.json(collaborationService.listDownloadRequests(actor));
    })
  );

  app.post(
    "/api/collaboration/download-requests/:id/decision",
    handler((request, response) => {
      const actor = collaborationAuth.requireSession(request, ["admin"]);
      const input = z
        .object({
          approve: z.boolean(),
          note: z.string().trim().max(500).default(""),
        })
        .parse(request.body);
      response.json(
        collaborationService.decideDownload({
          id: request.params.id,
          ...input,
          actor,
          request,
        })
      );
    })
  );

  app.get(
    "/api/portal/projects",
    handler((request, response) => {
      const user = collaborationAuth.requireSession(request);
      response.json(collaborationService.listPortalProjects(user));
    })
  );

  app.get(
    "/api/portal/projects/:publicationId",
    handler((request, response) => {
      const user = collaborationAuth.requireSession(request);
      const project = collaborationService.getPortalProject(
        user,
        request.params.publicationId
      );
      collaborationService.audit(
        user,
        "publication.viewed",
        "publication",
        request.params.publicationId,
        {},
        request
      );
      response.json(project);
    })
  );

  app.get(
    "/api/portal/download-requests",
    handler((request, response) => {
      const user = collaborationAuth.requireSession(request);
      response.json(collaborationService.listDownloadRequests(user));
    })
  );

  app.post(
    "/api/portal/download-requests",
    handler((request, response) => {
      const user = collaborationAuth.requireSession(request);
      const input = z
        .object({
          publicationId: idSchema,
          fileId: resourceIdSchema,
          purpose: z.string().trim().min(4).max(500),
        })
        .parse(request.body);
      response
        .status(201)
        .json(
          collaborationService.createDownloadRequest(
            user,
            input.publicationId,
            input.fileId,
            input.purpose,
            request
          )
        );
    })
  );

  app.post(
    "/api/portal/download-requests/:id/link",
    handler((request, response) => {
      const user = collaborationAuth.requireSession(request);
      response.json(
        collaborationService.createDownloadLink(
          user,
          request.params.id,
          baseUrl(request),
          request
        )
      );
    })
  );

  app.get(
    "/api/portal/files/:fileId/original",
    handler((request, response) => {
      const user = collaborationAuth.requireSession(request);
      const publicationId = z
        .string()
        .uuid()
        .parse(request.query.publicationId);
      const file = collaborationService.getSharedFile(
        user,
        publicationId,
        request.params.fileId,
        request
      );
      if (file.securityMode !== "trusted")
        throw new AuthError("高保密模式不提供原件直传", 403);
      if (!fs.existsSync(file.absolutePath))
        throw new AuthError("共享文件缺失", 404);
      const fileName = String(file.row.original_name).replace(/[\r\n"]/g, "_");
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("Content-Type", String(file.row.mime_type));
      response.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      response.sendFile(file.absolutePath);
    })
  );

  app.get(
    "/api/portal/files/:fileId/pages/:page.png",
    handler(async (request, response) => {
      const user = collaborationAuth.requireSession(request);
      const publicationId = z
        .string()
        .uuid()
        .parse(request.query.publicationId);
      const pageNumber = z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .parse(request.params.page);
      const file = collaborationService.getSharedFile(
        user,
        publicationId,
        request.params.fileId,
        request
      );
      const textPages = collaborationService.fileTextPages(file.row);
      const png = await renderSecurePage({
        absolutePath: file.absolutePath,
        mimeType: String(file.row.mime_type),
        pageNumber,
        textPages,
        identity: {
          name: user.name,
          email: user.email,
          viewedAt: new Date().toISOString(),
          reference: `${publicationId}:${request.params.fileId}`,
        },
      });
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      response.setHeader(
        "Content-Disposition",
        `inline; filename="secure-page-${pageNumber}.png"`
      );
      response.send(png);
    })
  );

  app.get(
    "/api/portal/files/:fileId/search",
    handler((request, response) => {
      const user = collaborationAuth.requireSession(request);
      const publicationId = z
        .string()
        .uuid()
        .parse(request.query.publicationId);
      const query = z.string().trim().min(1).max(100).parse(request.query.q);
      response.json(
        collaborationService.searchSharedFile(
          user,
          publicationId,
          request.params.fileId,
          query,
          request
        )
      );
    })
  );

  app.get(
    "/api/portal/download/:token",
    handler(async (request, response) => {
      const user = collaborationAuth.requireSession(request);
      const file = collaborationService.consumeDownload(
        user,
        request.params.token,
        request
      );
      const textPages = collaborationService.fileTextPages(file.row);
      const createdAt = new Date().toISOString();
      const pdf = await buildWatermarkedReviewPdf({
        absolutePath: file.absolutePath,
        mimeType: String(file.row.mime_type),
        pageCount: Number(file.row.page_count),
        textPages,
        identity: {
          name: user.name,
          email: user.email,
          viewedAt: createdAt,
          reference: file.downloadRequestId,
        },
      });
      collaborationService.completeDownload(
        user,
        {
          tokenId: file.downloadTokenId,
          requestId: file.downloadRequestId,
          fileId: String(file.row.id),
          publicationId: file.publicationId,
        },
        request
      );
      const baseName = String(file.row.original_name)
        .replace(/\.[^.]+$/, "")
        .replace(/[\r\n"]/g, "_");
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}-受控副本.pdf`)}`
      );
      response.send(pdf);
    })
  );
}

export function collaborationErrorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
) {
  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: "输入不符合要求",
      detail: error.issues.map(issue => issue.message),
    });
    return;
  }
  if (error instanceof AuthError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  console.error("[Cofound collaboration]", error);
  response
    .status(500)
    .json({ error: error instanceof Error ? error.message : "服务器处理失败" });
}
