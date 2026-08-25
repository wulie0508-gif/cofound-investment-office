import type { CodexAnalysisTaskMode } from "@shared/bp";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useState } from "react";
import { ANALYSIS_MODES } from "./codex-analysis-options";

export function CodexAnalysisBrief({
  mode,
  objective,
  disabled,
  onModeChange,
  onObjectiveChange,
}: {
  mode: CodexAnalysisTaskMode;
  objective: string;
  disabled: boolean;
  onModeChange: (value: CodexAnalysisTaskMode) => void;
  onObjectiveChange: (value: string) => void;
}) {
  const [showReferenceView, setShowReferenceView] = useState(mode !== "auto");
  const selected = ANALYSIS_MODES.find(item => item.value === mode)!;

  return (
    <div>
      <label htmlFor="codex-analysis-objective" className="field-label">
        告诉 Codex 你现在想判断什么（可选）
      </label>
      <Textarea
        id="codex-analysis-objective"
        value={objective}
        disabled={disabled}
        maxLength={1_000}
        className="mt-2 min-h-28 resize-y bg-card text-sm leading-6"
        placeholder="可以提问，也可以写下你的思路。例如：我倾向继续跟进，但担心订单质量。请和我一起验证，并指出我遗漏的反方证据。"
        onChange={event => onObjectiveChange(event.target.value)}
      />
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="text-[11px] leading-5 text-muted-foreground">
          内容会原样交给 Codex；留空也可以直接开始开放分析。
        </p>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {objective.length}/1000
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="mt-2 -ml-2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={showReferenceView}
        aria-controls="codex-analysis-reference-view"
        onClick={() => setShowReferenceView(current => !current)}
      >
        {showReferenceView ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
        {showReferenceView ? "收起参考视角" : "指定一个参考视角（可选）"}
      </Button>

      {showReferenceView ? (
        <div id="codex-analysis-reference-view" className="mt-2">
          <label htmlFor="codex-analysis-mode" className="field-label">
            参考视角
          </label>
          <Select
            value={mode}
            disabled={disabled}
            onValueChange={value =>
              onModeChange(value as CodexAnalysisTaskMode)
            }
          >
            <SelectTrigger
              id="codex-analysis-mode"
              className="mt-2 h-10 w-full bg-card"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {ANALYSIS_MODES.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {selected.description}
          </p>
        </div>
      ) : null}

      <p className="mt-4 border-l-2 border-signal pl-3 text-[11px] leading-5 text-muted-foreground">
        Codex 会围绕你的问题自由调用现有 Skill、核对 BP
        与相关资料，并在对话中继续追问和增强思路；看板只保存可复核的结构化结论。
      </p>
    </div>
  );
}
