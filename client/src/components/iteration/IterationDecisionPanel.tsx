import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CirclePause, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { IterationDecision, IterationStatus } from "./iteration-model";

type Copy = (chinese: string, english: string) => string;

export function IterationDecisionPanel({
  itemId,
  status,
  isPending,
  copy,
  onDecide,
}: {
  itemId: string;
  status: IterationStatus;
  isPending: boolean;
  copy: Copy;
  onDecide: (id: string, action: IterationDecision, note?: string) => void;
}) {
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const canSubmitRevision = revisionNote.trim().length > 0 && !isPending;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="field-label">{copy("你的决定", "Your decision")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {status === "ready" ? (
          <Button
            type="button"
            onClick={() => onDecide(itemId, "accept")}
            disabled={isPending}
          >
            {copy("确认采用", "Accept")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => setRevisionOpen(true)}
          disabled={isPending}
          aria-expanded={revisionOpen}
          aria-controls="iteration-revision-note"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {copy("请继续调整", "Revise")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="gap-2 text-muted-foreground"
          onClick={() => onDecide(itemId, "pause")}
          disabled={isPending}
        >
          <CirclePause className="size-3.5" aria-hidden="true" />
          {copy("暂不处理", "Pause")}
        </Button>
      </div>

      {revisionOpen ? (
        <div
          id="iteration-revision-note"
          className="mt-4 border-l-2 border-signal/35 pl-3"
        >
          <label htmlFor="revision-note" className="text-xs font-bold">
            {copy("还希望怎么调整？", "What should change?")}
          </label>
          <Textarea
            id="revision-note"
            value={revisionNote}
            onChange={event => setRevisionNote(event.target.value)}
            placeholder={copy(
              "例如：保留现在的结构，但把状态说明再说得简单一些。",
              "For example: keep the structure, but simplify the status wording."
            )}
            className="mt-2 min-h-20 resize-y bg-background text-sm leading-6"
            maxLength={4_000}
            autoFocus
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => onDecide(itemId, "revise", revisionNote.trim())}
              disabled={!canSubmitRevision}
            >
              {copy("提交调整意见", "Send revision")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRevisionOpen(false);
                setRevisionNote("");
              }}
              disabled={isPending}
            >
              {copy("取消", "Cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
