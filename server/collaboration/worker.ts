import { collaborationService } from "./service";

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function drainCollaborationJobs(maxJobs = 20) {
  if (running) return { processed: 0, busy: true };
  running = true;
  let processed = 0;
  try {
    while (processed < maxJobs) {
      const job = collaborationService.claimNextJob();
      if (!job) break;
      try {
        await collaborationService.processJob(job);
      } catch (error) {
        console.error(
          `[Cofound collaboration worker] ${job.kind} ${job.id}:`,
          error
        );
      }
      processed += 1;
    }
    return { processed, busy: false };
  } finally {
    running = false;
  }
}

export function startCollaborationWorker() {
  if (timer) return;
  timer = setInterval(() => void drainCollaborationJobs(), 1200);
  timer.unref();
  void drainCollaborationJobs();
}

export function stopCollaborationWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
