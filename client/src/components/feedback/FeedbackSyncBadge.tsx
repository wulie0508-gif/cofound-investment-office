import { Badge } from "@/components/ui/badge";
import { CircleCheck, Cloud, RefreshCw } from "lucide-react";
import { FEEDBACK_SYNC_LABELS, feedbackSyncTone } from "./feedback-labels";
import type { FeedbackSyncStatus } from "./feedback-model";

type Copy = (chinese: string, english: string) => string;

export function FeedbackSyncBadge({
  status,
  copy,
}: {
  status: FeedbackSyncStatus;
  copy: Copy;
}) {
  const label = FEEDBACK_SYNC_LABELS[status];
  const Icon =
    status === "synced"
      ? CircleCheck
      : status === "pending"
        ? Cloud
        : RefreshCw;
  return (
    <Badge variant="outline" className={`gap-1.5 ${feedbackSyncTone(status)}`}>
      <Icon className="size-3" aria-hidden="true" />
      {copy(label.chinese, label.english)}
    </Badge>
  );
}
