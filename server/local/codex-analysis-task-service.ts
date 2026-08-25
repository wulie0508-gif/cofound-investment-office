import type {
  CodexAnalysisTaskLaunchResult,
  CodexAnalysisTaskMode,
  CodexInvestmentAnalysisSkill,
} from "../../shared/bp";
import {
  launchCodexAnalysisTask,
  openExistingCodexThread,
  type CodexAppBridgeInput,
  type CodexAppBridgeResult,
  type CodexAppBridgeTerminalEvent,
} from "./codex-app-bridge";
import { getDatabase, type LocalDatabase } from "./database";
import { getIterationService } from "./iteration-service";

type CodexDesktopLauncher = () => { launched: boolean };
type CodexThreadLauncher = (
  input: CodexAppBridgeInput,
  lifecycle?: {
    onTurnTerminal?: (
      event: CodexAppBridgeTerminalEvent
    ) => void | Promise<void>;
  }
) => Promise<CodexAppBridgeResult> | CodexAppBridgeResult;
type ExistingThreadOpener = (threadId: string) => boolean;
const QUEUED_THREAD_REOPEN_GRACE_MS = 5 * 60_000;
const LAUNCH_SLOT_TTL_SECONDS = 5 * 60;

const defaultCodexThreadLauncher: CodexThreadLauncher = (input, lifecycle) =>
  launchCodexAnalysisTask(input, {
    onTurnTerminal: lifecycle?.onTurnTerminal,
  });

function shouldOpenExistingThread(
  task: CodexAnalysisTaskLaunchResult["task"],
  currentTime = Date.now()
) {
  if (!task.codexThreadId) return false;
  if (task.status === "queued") {
    const updatedAt = Date.parse(task.updatedAt);
    return (
      Number.isFinite(updatedAt) &&
      currentTime - updatedAt <= QUEUED_THREAD_REOPEN_GRACE_MS
    );
  }
  if (task.status === "claimed" || task.status === "analyzing") {
    const leaseExpiresAt = task.leaseExpiresAt
      ? Date.parse(task.leaseExpiresAt)
      : Number.NaN;
    return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > currentTime;
  }
  return false;
}

export async function createCodexAnalysisTask(
  input: {
    projectId: string;
    mode: CodexAnalysisTaskMode;
    requestedBy: string;
    userPrompt?: string;
  },
  database: LocalDatabase = getDatabase(),
  launchThread: CodexThreadLauncher = defaultCodexThreadLauncher,
  launchCodex: CodexDesktopLauncher = () => getIterationService().openCodex(),
  openExistingThread: ExistingThreadOpener = openExistingCodexThread
): Promise<CodexAnalysisTaskLaunchResult> {
  const created = database.createCodexAnalysisTask(input);
  const existingThreadId = created.task.codexThreadId;

  if (
    created.reused &&
    existingThreadId &&
    shouldOpenExistingThread(created.task)
  ) {
    return {
      task: created.task,
      reused: true,
      launch: {
        launched: true,
        mode: "app_server",
        error: null,
        recoverable: true,
      },
    };
  }

  const reservation = database.reserveCodexAnalysisTaskLaunch({
    taskId: created.task.id,
    ttlSeconds: LAUNCH_SLOT_TTL_SECONDS,
  });
  if (!reservation) {
    const task = database.getCodexAnalysisTask(created.task.id) ?? created.task;
    const threadId = task.codexThreadId;
    if (threadId && shouldOpenExistingThread(task)) {
      return {
        task,
        reused: true,
        launch: {
          launched: true,
          mode: task.launcherMode ?? "app_server",
          error: null,
          recoverable: true,
        },
      };
    }
    return {
      task,
      reused: true,
      launch: {
        launched: true,
        mode: task.launcherMode ?? "app_server",
        error: null,
        recoverable: true,
      },
    };
  }
  const launchToken = reservation.launchToken;

  const bridge = await launchThread(
    {
      taskId: created.task.id,
      projectId: created.task.projectId,
      selectedLens: created.task.mode,
      userPrompt: created.task.userPrompt,
    },
    {
      onTurnTerminal: event => {
        const currentTask = database.getCodexAnalysisTask(created.task.id);
        if (
          !currentTask ||
          ["completed", "failed", "superseded"].includes(currentTask.status)
        )
          return;
        database.failCodexAnalysisTaskFromLaunch({
          taskId: created.task.id,
          launchToken,
          errorDetail:
            event.status === "completed"
              ? "Codex 对话已结束但未返回分析结果，可重新发起"
              : (event.safeMessage ?? "Codex 分析会话未完成，请重新发起分析"),
          codexThreadId: event.threadId,
          codexTurnId: event.turnId,
        });
      },
    }
  );
  if (bridge.ok) {
    const launcherError = bridge.ui.opened ? null : bridge.ui.error.message;
    const recorded = database.recordCodexAnalysisTaskLaunch({
      taskId: created.task.id,
      launchToken,
      launcherMode: "app_server",
      launcherError,
      codexThreadId: bridge.threadId,
      codexTurnId: bridge.turnId,
    });
    if (!recorded.recorded) {
      return {
        task: recorded.task,
        reused: true,
        launch: {
          launched: Boolean(recorded.task.codexThreadId),
          mode: recorded.task.launcherMode ?? "app_server",
          error:
            recorded.task.errorDetail ?? "分析启动状态已经变化，请刷新后重试",
          recoverable: true,
        },
      };
    }
    return {
      task: recorded.task,
      reused: created.reused,
      launch: {
        launched: true,
        mode: "app_server",
        error: launcherError,
        recoverable: true,
      },
    };
  }

  try {
    const launch = launchCodex();
    const launcherError = launch.launched
      ? null
      : "分析任务已保存，但未能自动打开 Codex；请手动打开后处理 Cofound 分析待办";
    const task = database.recordCodexAnalysisTaskLaunch({
      taskId: created.task.id,
      launchToken,
      launcherMode: "desktop_fallback",
      launcherError,
    });
    database.releaseCodexAnalysisTaskLaunch(created.task.id, launchToken);
    return {
      task: task.task,
      reused: created.reused,
      launch: {
        launched: launch.launched,
        mode: "desktop_fallback",
        error: launcherError,
        recoverable: true,
      },
    };
  } catch {
    const message =
      "分析任务已保存，但未能自动打开 Codex；请确认桌面应用已经安装并登录";
    const task = database.recordCodexAnalysisTaskLaunch({
      taskId: created.task.id,
      launchToken,
      launcherMode: "desktop_fallback",
      launcherError: message,
    });
    database.releaseCodexAnalysisTaskLaunch(created.task.id, launchToken);
    return {
      task: task.task,
      reused: created.reused,
      launch: {
        launched: false,
        mode: "desktop_fallback",
        error: message,
        recoverable: true,
      },
    };
  }
}

export function claimCodexAnalysisTask(
  input: {
    taskId?: string;
    claimedBy: string;
    leaseSeconds: number;
    codexThreadId?: string;
    codexTurnId?: string;
  },
  database: LocalDatabase = getDatabase()
) {
  return database.claimCodexAnalysisTask(input);
}

export function progressCodexAnalysisTask(
  input: {
    taskId: string;
    claimToken: string;
    message: string;
    selectedSkill?: CodexInvestmentAnalysisSkill;
    routerReason?: string;
    codexThreadId?: string;
    codexTurnId?: string;
    leaseSeconds: number;
  },
  database: LocalDatabase = getDatabase()
) {
  return database.progressCodexAnalysisTask(input);
}

export function completeCodexAnalysisTask(
  input: {
    taskId: string;
    claimToken: string;
    runId: string;
    selectedSkill: CodexInvestmentAnalysisSkill;
    routerReason: string;
    codexThreadId?: string;
    codexTurnId?: string;
  },
  database: LocalDatabase = getDatabase()
) {
  return database.completeCodexAnalysisTask(input);
}

export function failCodexAnalysisTask(
  input: {
    taskId: string;
    claimToken: string;
    errorDetail: string;
    codexThreadId?: string;
    codexTurnId?: string;
  },
  database: LocalDatabase = getDatabase()
) {
  return database.failCodexAnalysisTask(input);
}
