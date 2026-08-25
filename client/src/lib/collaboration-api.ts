import type {
  AnnotationInbox,
  AuditEvent,
  CollaborationOverview,
  Collaborator,
  DownloadRequest,
  EmailOtpRequestResult,
  EmailOtpStatus,
  Invitation,
  PortalProject,
  PublicationAnnotationSnapshot,
  PublicationDetail,
  PublicationSummary,
  SessionUser,
  ShareAccessMode,
  SyncJob,
  UiLanguagePreference,
} from "@shared/collaboration";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new ApiError(
      body.error || `请求失败（${response.status}）`,
      response.status
    );
  return body as T;
}

export const collaborationApi = {
  session: () => api<{ user: SessionUser | null }>("/api/auth/session"),
  emailOtpStatus: () => api<EmailOtpStatus>("/api/auth/email/status"),
  requestEmailOtp: (email: string, name?: string) =>
    api<EmailOtpRequestResult>("/api/auth/email/request", {
      method: "POST",
      body: JSON.stringify({ email, name: name?.trim() || undefined }),
    }),
  verifyEmailOtp: (email: string, token: string, name?: string) =>
    api<{ user: SessionUser }>("/api/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({
        email,
        token,
        name: name?.trim() || undefined,
      }),
    }),
  updateProfile: (input: {
    name?: string;
    languagePreference?: UiLanguagePreference;
  }) =>
    api<{ user: SessionUser }>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  localAdmin: () =>
    api<{ user: SessionUser }>("/api/auth/local-admin", { method: "POST" }),
  login: (email: string, password: string) =>
    api<{ user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  acceptInvite: (token: string, password: string) =>
    api<{ user: SessionUser }>(
      `/api/auth/invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST", body: JSON.stringify({ password }) }
    ),
  overview: () => api<CollaborationOverview>("/api/collaboration/overview"),
  users: () => api<Collaborator[]>("/api/collaboration/users"),
  invitations: () => api<Invitation[]>("/api/collaboration/invitations"),
  invite: (input: {
    email: string;
    name: string;
    role: "internal" | "external";
  }) =>
    api<Invitation>("/api/collaboration/invitations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeInvitation: (id: string) =>
    api<{ ok: true }>(`/api/collaboration/invitations/${id}/revoke`, {
      method: "POST",
    }),
  setUserState: (id: string, state: "active" | "suspended") =>
    api<SessionUser>(`/api/collaboration/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ state }),
    }),
  publications: () =>
    api<PublicationSummary[]>("/api/collaboration/publications"),
  annotationInbox: () => api<AnnotationInbox>("/api/collaboration/annotations"),
  publicationAnnotations: (id: string) =>
    api<PublicationAnnotationSnapshot>(
      `/api/collaboration/publications/${encodeURIComponent(id)}/annotations`
    ),
  publication: (id: string) =>
    api<PublicationDetail>(`/api/collaboration/publications/${id}`),
  configurePublication: (
    projectId: string,
    input: {
      shareMode: "fields_only" | "selected_files";
      securityMode: "trusted" | "high_security";
      accessMode: ShareAccessMode;
      accessCode?: string;
      selectedFields: string[];
      selectedFileIds: string[];
      expiresAt: string | null;
      annotationEnabled: boolean;
      members: Array<{
        userId: string;
        canViewFields: boolean;
        canViewFiles: boolean;
        canRequestDownload: boolean;
      }>;
    }
  ) =>
    api<PublicationDetail>(
      `/api/collaboration/projects/${projectId}/publication`,
      { method: "PUT", body: JSON.stringify(input) }
    ),
  syncPublication: (id: string) =>
    api<{ publication: PublicationDetail }>(
      `/api/collaboration/publications/${id}/sync`,
      { method: "POST" }
    ),
  pausePublication: (id: string) =>
    api<PublicationDetail>(`/api/collaboration/publications/${id}/pause`, {
      method: "POST",
    }),
  jobs: () => api<SyncJob[]>("/api/collaboration/jobs"),
  retryJob: (id: string) =>
    api<SyncJob>(`/api/collaboration/jobs/${id}/retry`, { method: "POST" }),
  audit: () => api<AuditEvent[]>("/api/collaboration/audit"),
  adminDownloads: () =>
    api<DownloadRequest[]>("/api/collaboration/download-requests"),
  decideDownload: (id: string, approve: boolean, note: string) =>
    api<DownloadRequest>(
      `/api/collaboration/download-requests/${id}/decision`,
      { method: "POST", body: JSON.stringify({ approve, note }) }
    ),
  portalProjects: () => api<PortalProject[]>("/api/portal/projects"),
  portalProject: (id: string) =>
    api<PortalProject>(`/api/portal/projects/${id}`),
  portalDownloads: () =>
    api<DownloadRequest[]>("/api/portal/download-requests"),
  requestDownload: (publicationId: string, fileId: string, purpose: string) =>
    api<DownloadRequest>("/api/portal/download-requests", {
      method: "POST",
      body: JSON.stringify({ publicationId, fileId, purpose }),
    }),
  createDownloadLink: (id: string) =>
    api<{ url: string; expiresAt: string }>(
      `/api/portal/download-requests/${id}/link`,
      { method: "POST" }
    ),
  searchFile: (publicationId: string, fileId: string, query: string) =>
    api<Array<{ segment: number; excerpt: string }>>(
      `/api/portal/files/${fileId}/search?publicationId=${encodeURIComponent(publicationId)}&q=${encodeURIComponent(query)}`
    ),
};
