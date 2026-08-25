import {
  launchCodexProjectWorkspace,
  type CodexProjectWorkspaceLaunchResult,
} from "./codex-app-bridge";
import { getDatabase, type LocalDatabase } from "./database";

type ProjectWorkspaceLauncher = (input: {
  projectId: string;
}) => Promise<CodexProjectWorkspaceLaunchResult>;

export async function openCodexProjectWorkspace(
  input: { projectId: string; requestedBy: string },
  database: LocalDatabase = getDatabase(),
  launchWorkspace: ProjectWorkspaceLauncher = input =>
    launchCodexProjectWorkspace(input)
) {
  if (!input.requestedBy.trim())
    throw new Error("打开项目对话必须记录当前用户");
  const project = database.getProjectRow(input.projectId);
  if (!project) throw new Error("项目不存在");
  if (Boolean(project.archived))
    throw new Error("项目位于回收站，请先恢复后再打开对话");
  return launchWorkspace({ projectId: input.projectId });
}
