import type { AnalysisPayload, ProjectStatus, ShareMode } from "./bp";

export const USER_ROLES = ["admin", "internal", "external"] as const;
export const USER_STATES = ["invited", "active", "suspended"] as const;
export const UI_LANGUAGE_PREFERENCES = ["bilingual", "zh-CN", "en"] as const;
export const PUBLICATION_STATES = [
  "draft",
  "published",
  "paused",
  "expired",
] as const;
export const SECURITY_MODES = ["trusted", "high_security"] as const;
export const SHARE_ACCESS_MODES = ["open", "passcode", "member_email"] as const;
export const JOB_STATES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "conflict",
] as const;
export const VERIFICATION_STATES = [
  "supported",
  "partial",
  "not_found",
  "conflict",
] as const;
export const DOWNLOAD_STATES = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "downloaded",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserState = (typeof USER_STATES)[number];
export type UiLanguagePreference = (typeof UI_LANGUAGE_PREFERENCES)[number];
export type PublicationState = (typeof PUBLICATION_STATES)[number];
export type SecurityMode = (typeof SECURITY_MODES)[number];
export type ShareAccessMode = (typeof SHARE_ACCESS_MODES)[number];
export type JobState = (typeof JOB_STATES)[number];
export type VerificationState = (typeof VERIFICATION_STATES)[number];
export type DownloadState = (typeof DOWNLOAD_STATES)[number];

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  state: UserState;
  languagePreference: UiLanguagePreference;
};

export type EmailOtpStatus = {
  mode: "supabase" | "local_preview" | "unavailable";
  needsLocalAdminSetup: boolean;
  configuredAdminEmail: string | null;
};

export type EmailOtpRequestResult = {
  delivery: "email" | "local_preview";
  maskedEmail: string;
  expiresInSeconds: number;
  previewCode: string | null;
};

export type Collaborator = SessionUser & {
  createdAt: string;
  lastSignedInAt: string | null;
  grants: number;
};

export type Invitation = {
  id: string;
  email: string;
  name: string;
  role: Exclude<UserRole, "admin">;
  state: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  inviteUrl: string | null;
};

export type PublicationMember = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  canViewFields: boolean;
  canViewFiles: boolean;
  canRequestDownload: boolean;
};

export type VerificationResult = {
  fieldKey: string;
  state: VerificationState;
  detail: string;
  evidencePage: number | null;
  checkedAt: string;
};

export type PublicationSummary = {
  id: string;
  projectId: string;
  projectName: string;
  state: PublicationState;
  shareMode: ShareMode;
  securityMode: SecurityMode;
  localVersion: number;
  remoteVersion: number;
  syncState: "pending" | "synced" | "conflict" | "error";
  selectedFieldCount: number;
  selectedFileCount: number;
  memberCount: number;
  accessMode: ShareAccessMode;
  accessCodeConfigured: boolean;
  configuredByName: string | null;
  configuredByEmail: string | null;
  configuredAt: string | null;
  shareToken: string;
  shareUrl: string;
  remoteShareUrl: string | null;
  annotationEnabled: boolean;
  downloadEnabled: boolean;
  expiresAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type ShareAnnotation = {
  id: string;
  publicationId: string;
  fileId: string | null;
  fieldKey: string | null;
  pageNumber: number | null;
  parentId: string | null;
  authorName: string;
  authorEmail: string | null;
  body: string;
  status: "open" | "resolved";
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type AnnotationInboxItem = {
  id: string;
  publicationId: string;
  sourceFileId: string | null;
  fileName: string | null;
  fieldKey: string | null;
  pageNumber: number | null;
  parentId: string | null;
  authorName: string;
  body: string;
  status: "open" | "resolved";
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicationAnnotationSnapshot = {
  publicationId: string;
  projectId: string;
  projectName: string;
  remoteVersion: number;
  revision: number;
  truncated: boolean;
  fetchedAt: string;
  annotations: AnnotationInboxItem[];
};

export type AnnotationInbox = {
  publications: PublicationAnnotationSnapshot[];
  errors: Array<{
    publicationId: string;
    projectName: string;
    message: string;
  }>;
  fetchedAt: string;
};

export type LinkShareProject = PortalProject & {
  shareToken: string;
  revision: number;
  annotationEnabled: boolean;
  downloadEnabled: false;
  viewer: {
    email: string;
    name: string;
    role: "internal" | "external";
  } | null;
  annotations: ShareAnnotation[];
};

export type LinkShareAuthStatus = {
  accessMode: ShareAccessMode;
  required: boolean;
  authenticated: boolean;
  providerConfigured: boolean;
  viewer: LinkShareProject["viewer"];
};

export type LiteSyncFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  sha256: string;
  contentBase64: string;
};

export type LiteSyncMember = {
  email: string;
  name: string;
  role: Exclude<UserRole, "admin">;
};

export type LiteSyncPayload = {
  publicationId: string;
  shareToken: string;
  localProjectId: string;
  remoteVersion: number;
  annotationEnabled: boolean;
  downloadEnabled: false;
  accessMode: ShareAccessMode;
  accessCodeHash: string | null;
  project: Omit<LinkShareProject, "shareToken" | "annotations" | "viewer">;
  files: LiteSyncFile[];
  members: LiteSyncMember[];
};

export type PublicationDetail = PublicationSummary & {
  selectedFields: string[];
  selectedFileIds: string[];
  members: PublicationMember[];
  verification: VerificationResult[];
  latestJob: SyncJob | null;
};

export type SyncJob = {
  id: string;
  kind: "publish" | "sync" | "verify" | "watermarked_download";
  projectId: string | null;
  publicationId: string | null;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type SharedFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  securityMode: SecurityMode;
  canRequestDownload: boolean;
  viewerUrl: string;
};

export type PortalProject = {
  publicationId: string;
  projectId: string;
  name: string;
  product: string | null;
  industry: string | null;
  fundingRound: string | null;
  status: ProjectStatus;
  summary: string | null;
  shareMode: ShareMode;
  securityMode: SecurityMode;
  publishedAt: string | null;
  expiresAt: string | null;
  fields: Array<{
    key: string;
    label: string;
    englishLabel: string;
    value: unknown;
    evidence: { page: number | null; quote: string | null } | null;
    verification: VerificationState;
  }>;
  analysis: Pick<
    AnalysisPayload,
    "risks" | "missingInformation" | "commercialChecks"
  > | null;
  files: SharedFile[];
};

export type DownloadRequest = {
  id: string;
  publicationId: string;
  projectName: string;
  fileId: string;
  fileName: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  purpose: string;
  state: DownloadState;
  reviewerName: string | null;
  reviewerNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  downloadUrl: string | null;
};

export type AuditEvent = {
  id: number;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
};

export type CollaborationOverview = {
  publications: PublicationSummary[];
  pendingApprovals: number;
  activeMembers: number;
  failedJobs: number;
  recentAudit: AuditEvent[];
};
