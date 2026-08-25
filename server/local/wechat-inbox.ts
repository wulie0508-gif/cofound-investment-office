import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MATERIAL_EXTENSIONS } from "./extractor";
import {
  importAnyFilePath,
  type MaterialIntakeResult,
} from "./material-importer";
import { getDatabase, type LocalDatabase } from "./database";

const STATE_SCHEMA_VERSION = 3;
const DEFAULT_TRIGGER_PHRASE = "存入项目库";
const ARM_WINDOW_MS = 15 * 60 * 1000;
const MAX_DISCOVERED_FILES = 2_000;

type TriggerHit = {
  id: string;
  phrase?: string;
};

type AttachmentHit = {
  id: string;
  filename: string;
};

export type WechatRouterSnapshot = {
  generatedAt?: string;
  scopeVerified?: boolean;
  chatUsername?: string;
  triggerPhrase?: string;
  triggers?: TriggerHit[];
  attachments?: AttachmentHit[];
};

type InboxState = {
  schemaVersion: number;
  initialized: boolean;
  knownFileSignatures: string[];
  processedTriggerIds: string[];
  processedAttachmentIds: string[];
  armedUntil: string | null;
  initializedAt: string | null;
  lastCheckedAt: string | null;
  lastImportedAt: string | null;
  lastImportedCount: number;
  lastError: string | null;
};

export type WechatInboxScanJob = {
  id: string;
  state: "idle" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  imported: number;
  duplicates: number;
  pending: number;
  ignored: number;
  message: string;
};

export type WechatInboxOptions = {
  dataDir?: string;
  homeDir?: string;
  routerRoot?: string;
  attachmentRoots?: string[];
  snapshotPath?: string;
  triggerPhrase?: string;
  now?: () => Date;
  importPath?: (
    sourcePath: string,
    database: LocalDatabase,
  ) => Promise<MaterialIntakeResult>;
};

type DiscoveredFile = {
  absolutePath: string;
  filename: string;
  signature: string;
  modifiedMs: number;
};

function emptyState(): InboxState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    initialized: false,
    knownFileSignatures: [],
    processedTriggerIds: [],
    processedAttachmentIds: [],
    armedUntil: null,
    initializedAt: null,
    lastCheckedAt: null,
    lastImportedAt: null,
    lastImportedCount: 0,
    lastError: null,
  };
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  fs.renameSync(temporaryPath, filePath);
}

function splitConfiguredRoots(value: string | undefined) {
  if (!value) return [];
  return value
    .split(path.delimiter)
    .map(item => item.trim())
    .filter(Boolean);
}

function discoverDefaultAttachmentRoots(homeDir: string) {
  const accountRoot = path.join(homeDir, "Documents", "xwechat_files");
  if (!fs.existsSync(accountRoot)) return [];
  return fs
    .readdirSync(accountRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith("wxid_"))
    .map(entry => path.join(accountRoot, entry.name, "msg", "file"))
    .filter(candidate => fs.existsSync(candidate));
}

function fileSignature(absolutePath: string, size: number, modifiedMs: number) {
  return crypto
    .createHash("sha256")
    .update(`${path.resolve(absolutePath).toLowerCase()}\0${size}\0${modifiedMs}`)
    .digest("hex");
}

function cleanFilename(value: string) {
  return path.basename(value.replace(/\0/g, "")).normalize("NFKC").trim();
}

function boundedUnique(values: string[], limit = 4_000) {
  return [...new Set(values)].slice(-limit);
}

export class WechatBpInbox {
  readonly dataDir: string;
  readonly statePath: string;
  readonly snapshotPath: string;
  readonly routerRoot: string;
  readonly attachmentRoots: string[];
  readonly triggerPhrase: string;
  private readonly now: () => Date;
  private readonly importPath: NonNullable<WechatInboxOptions["importPath"]>;

  constructor(options: WechatInboxOptions = {}) {
    this.dataDir = path.resolve(
      options.dataDir ??
        process.env.COF_BP_DATA_DIR ??
        path.join(process.cwd(), "data"),
    );
    this.statePath = path.join(
      this.dataDir,
      "integrations",
      "wechat-bp-inbox-state.json",
    );
    this.snapshotPath = path.resolve(
      options.snapshotPath ??
        path.join(this.dataDir, "integrations", "wechat-filehelper-snapshot.json"),
    );
    this.routerRoot = path.resolve(
      options.routerRoot ??
        process.env.WECHAT_CONTENT_ROUTER_ROOT ??
        path.join(os.homedir(), ".codex", "skills", "wechat-content-router-windows"),
    );
    const configuredRoots =
      options.attachmentRoots ??
      splitConfiguredRoots(process.env.COF_BP_WECHAT_FILES_DIRS);
    this.attachmentRoots = boundedUnique(
      (configuredRoots.length
        ? configuredRoots
        : discoverDefaultAttachmentRoots(options.homeDir ?? os.homedir()))
        .map(root => path.resolve(root))
        .filter(root => fs.existsSync(root)),
      20,
    );
    this.triggerPhrase =
      options.triggerPhrase ??
      process.env.COF_BP_WECHAT_TRIGGER ??
      DEFAULT_TRIGGER_PHRASE;
    this.now = options.now ?? (() => new Date());
    this.importPath =
      options.importPath ??
      ((sourcePath, database) => importAnyFilePath(sourcePath, {}, database));
  }

  private loadState() {
    const loaded = readJson<InboxState>(this.statePath, emptyState());
    return loaded.schemaVersion === STATE_SCHEMA_VERSION
      ? { ...emptyState(), ...loaded }
      : emptyState();
  }

  private saveState(state: InboxState) {
    writeJsonAtomic(this.statePath, {
      ...state,
      knownFileSignatures: boundedUnique(state.knownFileSignatures),
      processedTriggerIds: boundedUnique(state.processedTriggerIds, 1_000),
      processedAttachmentIds: boundedUnique(
        state.processedAttachmentIds,
        2_000,
      ),
    });
  }

  private readSnapshot() {
    return readJson<WechatRouterSnapshot>(this.snapshotPath, {});
  }

  private discoverFiles() {
    const discovered: DiscoveredFile[] = [];
    const visit = (directory: string) => {
      if (discovered.length >= MAX_DISCOVERED_FILES) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (discovered.length >= MAX_DISCOVERED_FILES) break;
        if (entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(absolutePath);
          continue;
        }
        if (
          !entry.isFile() ||
          !MATERIAL_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
        ) {
          continue;
        }
        try {
          const stat = fs.statSync(absolutePath);
          discovered.push({
            absolutePath,
            filename: cleanFilename(entry.name),
            signature: fileSignature(absolutePath, stat.size, stat.mtimeMs),
            modifiedMs: stat.mtimeMs,
          });
        } catch {
          // A file can disappear while WeChat is moving it into place.
        }
      }
    };
    for (const root of this.attachmentRoots) visit(root);
    return discovered;
  }

  status(job: WechatInboxScanJob) {
    const state = this.loadState();
    const routerScript = path.join(
      this.routerRoot,
      "scripts",
      "frida_route",
      "run_frida_scan.py",
    );
    return {
      available:
        this.attachmentRoots.length > 0 && fs.existsSync(routerScript),
      initialized: state.initialized,
      triggerPhrase: this.triggerPhrase,
      accountRoots: this.attachmentRoots.length,
      knownFiles: state.knownFileSignatures.length,
      routerAvailable: fs.existsSync(routerScript),
      lastCheckedAt: state.lastCheckedAt,
      lastImportedAt: state.lastImportedAt,
      lastImportedCount: state.lastImportedCount,
      lastError: state.lastError,
      armed: Boolean(
        state.armedUntil &&
          new Date(state.armedUntil).getTime() > this.now().getTime(),
      ),
      scanJob: job,
    };
  }

  initialize() {
    const now = this.now().toISOString();
    const files = this.discoverFiles();
    const snapshot = this.readSnapshot();
    const state: InboxState = {
      ...emptyState(),
      initialized: true,
      initializedAt: now,
      lastCheckedAt: now,
      knownFileSignatures: files.map(file => file.signature),
      processedTriggerIds: (snapshot.triggers ?? [])
        .map(hit => hit.id)
        .filter(Boolean),
      processedAttachmentIds: (snapshot.attachments ?? [])
        .map(hit => hit.id)
        .filter(Boolean),
    };
    this.saveState(state);
    return {
      initialized: true,
      baselineFiles: files.length,
      triggerPhrase: this.triggerPhrase,
    };
  }

  async consumeSnapshot(database: LocalDatabase = getDatabase()) {
    const state = this.loadState();
    if (!state.initialized) throw new Error("请先建立微信收件基线");
    const snapshot = this.readSnapshot();
    if (!snapshot.scopeVerified || snapshot.chatUsername !== "filehelper") {
      throw new Error("本轮扫描无法确认文件传输助手范围，已停止导入");
    }
    if (snapshot.triggerPhrase !== this.triggerPhrase) {
      throw new Error("本轮扫描口令与 BP 收件口令不一致");
    }

    const now = this.now();
    const knownFiles = new Set(state.knownFileSignatures);
    const processedTriggers = new Set(state.processedTriggerIds);
    const processedAttachments = new Set(state.processedAttachmentIds);
    const newTriggers = (snapshot.triggers ?? []).filter(
      hit => hit.id && !processedTriggers.has(hit.id),
    );
    const newAttachmentHits = (snapshot.attachments ?? []).filter(
      hit => hit.id && !processedAttachments.has(hit.id),
    );
    let armedUntil = state.armedUntil
      ? new Date(state.armedUntil).getTime()
      : 0;
    if (newTriggers.length) armedUntil = now.getTime() + ARM_WINDOW_MS;
    const armed = armedUntil > now.getTime();

    const files = this.discoverFiles();
    const newFiles = files.filter(file => !knownFiles.has(file.signature));
    const imported: Array<MaterialIntakeResult & { filename: string }> = [];
    const errors: Array<{ filename: string; error: string }> = [];
    let ignored = 0;

    for (const hit of newAttachmentHits) {
      const filename = cleanFilename(hit.filename);
      const matches = newFiles
        .filter(
          file => file.filename.localeCompare(filename, undefined, { sensitivity: "base" }) === 0,
        )
        .sort((left, right) => right.modifiedMs - left.modifiedMs);
      const match = matches[0];
      if (!armed || !match) {
        ignored += 1;
        continue;
      }
      try {
        const result = await this.importPath(match.absolutePath, database);
        imported.push({ ...result, filename });
      } catch (error) {
        errors.push({
          filename,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const checkedAt = now.toISOString();
    const nextState: InboxState = {
      ...state,
      knownFileSignatures: boundedUnique([
        ...state.knownFileSignatures,
        ...files.map(file => file.signature),
      ]),
      processedTriggerIds: boundedUnique([
        ...state.processedTriggerIds,
        ...newTriggers.map(hit => hit.id),
      ]),
      processedAttachmentIds: boundedUnique([
        ...state.processedAttachmentIds,
        ...newAttachmentHits.map(hit => hit.id),
      ]),
      armedUntil:
        imported.length > 0 || armedUntil <= now.getTime()
          ? null
          : new Date(armedUntil).toISOString(),
      lastCheckedAt: checkedAt,
      lastImportedAt: imported.length ? checkedAt : state.lastImportedAt,
      lastImportedCount: imported.length,
      lastError: errors.length ? errors.map(error => error.error).join("；") : null,
    };
    this.saveState(nextState);
    return {
      triggers: newTriggers.length,
      attachmentHits: newAttachmentHits.length,
      newFiles: newFiles.length,
      imported,
      duplicates: imported.filter(item => item.duplicate).length,
      pending: imported.filter(item => item.destination === "pending").length,
      ignored,
      errors,
      armed: Boolean(nextState.armedUntil),
    };
  }
}

let singleton: WechatBpInbox | undefined;
let scanJob: WechatInboxScanJob = {
  id: "idle",
  state: "idle",
  startedAt: null,
  completedAt: null,
  imported: 0,
  duplicates: 0,
  pending: 0,
  ignored: 0,
  message: "尚未检查",
};

export function getWechatBpInbox() {
  singleton ??= new WechatBpInbox();
  return singleton;
}

export function getWechatInboxJob() {
  return { ...scanJob };
}

export function startWechatInboxScan() {
  if (scanJob.state === "running") return { ...scanJob };
  const inbox = getWechatBpInbox();
  const status = inbox.status(scanJob);
  if (!status.available) throw new Error("未找到微信路由或微信文件目录");
  if (!status.initialized) throw new Error("请先建立微信收件基线");

  const wrapper = path.resolve(
    process.cwd(),
    "integrations",
    "wechat-bp-inbox",
    "scan_filehelper.py",
  );
  if (!fs.existsSync(wrapper)) throw new Error("微信 BP 接收器脚本缺失");
  const id = `wechat_${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  scanJob = {
    id,
    state: "running",
    startedAt,
    completedAt: null,
    imported: 0,
    duplicates: 0,
    pending: 0,
    ignored: 0,
    message: "正在核对文件传输助手，通常需要 1–2 分钟",
  };

  const python = process.env.COF_BP_PYTHON ?? "python";
  const child = spawn(
    python,
    [
      wrapper,
      "--router-root",
      inbox.routerRoot,
      "--snapshot",
      inbox.snapshotPath,
      "--trigger-phrase",
      inbox.triggerPhrase,
      "--seconds",
      process.env.COF_BP_WECHAT_SCAN_SECONDS ?? "120",
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const remember = (chunk: Buffer) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-2_000);
  };
  child.stdout.on("data", remember);
  child.stderr.on("data", remember);
  child.on("error", error => {
    if (scanJob.id !== id) return;
    scanJob = {
      ...scanJob,
      state: "failed",
      completedAt: new Date().toISOString(),
      message: `无法启动微信接收器：${error.message}`,
    };
  });
  child.on("close", code => {
    if (scanJob.id !== id || scanJob.state !== "running") return;
    if (code !== 0) {
      const detail = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(-2)
        .join("；");
      scanJob = {
        ...scanJob,
        state: "failed",
        completedAt: new Date().toISOString(),
        message:
          detail ||
          "微信扫描失败；请确认微信已登录，必要时以管理员身份启动本地软件",
      };
      return;
    }
    void inbox
      .consumeSnapshot()
      .then(result => {
        scanJob = {
          ...scanJob,
          state: "succeeded",
          completedAt: new Date().toISOString(),
          imported: result.imported.length,
          duplicates: result.duplicates,
          pending: result.pending,
          ignored: result.ignored,
          message: result.imported.length
            ? `已接收 ${result.imported.length} 份资料${result.pending ? `，${result.pending} 份待归档` : ""}`
            : result.armed
              ? "已收到口令，等待你发送 BP 文件"
              : "未发现新的“口令 + BP 文件”组合",
        };
      })
      .catch(error => {
        scanJob = {
          ...scanJob,
          state: "failed",
          completedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        };
      });
  });
  return { ...scanJob };
}
