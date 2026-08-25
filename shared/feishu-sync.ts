export const FEISHU_INDEX_FIELD_NAMES = {
  syncKey: "同步键",
  projectId: "项目 ID",
  projectName: "项目名称",
  localFileId: "本地文件 ID",
  materialType: "资料类型",
  bpVersion: "BP 版本",
  originalFilename: "原始文件名",
  driveFilename: "云盘文件名",
  sha256: "SHA-256",
  sizeBytes: "文件大小（字节）",
  mimeType: "MIME 类型",
  driveUrl: "飞书文件链接",
  driveFileToken: "飞书文件 Token",
  syncStatus: "同步状态",
  syncedAt: "同步时间",
  syncedBy: "同步操作者",
} as const;

export const FEISHU_INDEX_REQUIRED_FIELDS = Object.values(
  FEISHU_INDEX_FIELD_NAMES
);

export type FeishuSyncFileKind = "bp" | "material";

export type FeishuStorageScope = "enterprise_shared" | "personal" | "unknown";

export type FeishuInternalStorageConfig = {
  /** Resolved Drive folder token. This is a locator, not an access credential. */
  driveRootFolderToken: string;
  /** Resolved Base token. This is a locator, not an access credential. */
  baseToken: string;
  /** Resolved Base table id or an exact table name. */
  baseTableId: string;
  /** Optional feedback Base locator. Falls back to baseToken only when a feedback table is explicit. */
  feedbackBaseToken?: string;
  /** Optional exact table id/name for the independently governed product-feedback ledger. */
  feedbackTableId?: string;
  /** Explicitly records whether the configured Drive target is company-shared or personal. */
  storageScope?: FeishuStorageScope;
};

export type FeishuSyncSourceFile = {
  fileId: string;
  kind: FeishuSyncFileKind;
  category: string;
  versionNumber: number | null;
  originalName: string;
  absolutePath: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
};

export type FeishuProjectSyncInput = {
  project: {
    id: string;
    name: string;
  };
  files: FeishuSyncSourceFile[];
  requestedBy: string;
};

export type FeishuSyncPlanItem = FeishuSyncSourceFile & {
  syncKey: string;
  folderKind: "bp" | "material";
  remoteFilename: string;
};

export type FeishuSyncPreflightAction = "add_new" | "skip_duplicate";

/**
 * Read-only comparison against the thin Feishu index. This result deliberately
 * contains no Drive token, Base record id, URL or source hash so it is safe to
 * use when composing the human confirmation summary.
 */
export type FeishuSyncPreflightItem = {
  fileId: string;
  action: FeishuSyncPreflightAction;
};

export type FeishuProjectSyncPreflight = {
  items: FeishuSyncPreflightItem[];
};

export type FeishuProjectSyncPlan = {
  schemaVersion: "1.0";
  planId: string;
  generatedAt: string;
  project: FeishuProjectSyncInput["project"];
  requestedBy: string;
  config: FeishuInternalStorageConfig;
  folderLayout: {
    projectFolderName: string;
    bpFolderName: "01_BP 原件";
    materialFolderName: "02_补充材料";
  };
  items: FeishuSyncPlanItem[];
  invariants: {
    identity: "user";
    retainEveryVersion: true;
    overwriteAllowed: false;
    deleteAllowed: false;
    dedupeKey: "sha256";
    baseRole: "thin_index";
    credentialsPersisted: false;
  };
};

export type FeishuSyncItemReceipt = {
  fileId: string;
  sha256: string;
  remoteFilename: string;
  status: "skipped_existing" | "succeeded" | "failed";
  recoveryMode: "none" | "indexed_existing_drive_file";
  driveFileToken: string | null;
  driveUrl: string | null;
  baseRecordId: string | null;
  readBackVerified: boolean;
  error: string | null;
};

export type FeishuProjectSyncReceipt = {
  schemaVersion: "1.0";
  receiptId: string;
  planId: string;
  projectId: string;
  requestedBy: string;
  mode: "dry_run" | "execute";
  status: "planned" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  writes: {
    foldersCreated: number;
    filesUploaded: number;
    indexRecordsCreated: number;
    overwrites: 0;
    deletes: 0;
  };
  verification: {
    schemaChecked: boolean;
    readBackChecks: number;
    allPassed: boolean;
  };
  items: FeishuSyncItemReceipt[];
  error: string | null;
  boundaries: FeishuProjectSyncPlan["invariants"];
};

export const FEISHU_TEAM_INBOX_NAME = "00_团队收件箱（待导入）" as const;

export type FeishuInboxPlanAction =
  | "download_and_import"
  | "restore_after_verification"
  | "skip_already_imported"
  | "unsupported";

export type FeishuInboxPlanItem = {
  remoteName: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
  action: FeishuInboxPlanAction;
};

export type FeishuInboxPlan = {
  inboxName: typeof FEISHU_TEAM_INBOX_NAME;
  storageScope: "enterprise_shared";
  generatedAt: string;
  items: FeishuInboxPlanItem[];
};

export type FeishuInboxPullItem = {
  remoteName: string;
  status:
    | "imported"
    | "restored"
    | "skipped_duplicate"
    | "skipped_unchanged"
    | "unsupported"
    | "failed";
  projectId: string | null;
  versionNumber: number | null;
  message: string | null;
};

export type FeishuInboxPullReceipt = {
  inboxName: typeof FEISHU_TEAM_INBOX_NAME;
  requestedBy: string;
  startedAt: string;
  finishedAt: string;
  downloaded: number;
  imported: number;
  restored: number;
  skipped: number;
  failed: number;
  items: FeishuInboxPullItem[];
};
