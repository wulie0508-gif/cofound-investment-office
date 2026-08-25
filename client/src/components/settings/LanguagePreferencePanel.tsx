import { Check, Languages } from "lucide-react";
import type { UiLanguagePreference } from "@shared/collaboration";

const options: Array<{
  value: UiLanguagePreference;
  title: string;
  englishTitle: string;
  description: string;
}> = [
  {
    value: "bilingual",
    title: "中英双语",
    englishTitle: "Bilingual",
    description: "中文主信息配合英文标签，适合跨境团队协作。",
  },
  {
    value: "zh-CN",
    title: "简体中文",
    englishTitle: "Chinese",
    description: "导航与账户设置优先显示简体中文。",
  },
  {
    value: "en",
    title: "English",
    englishTitle: "英文界面",
    description: "Navigation and account settings use English labels.",
  },
];

export function LanguagePreferencePanel({
  value,
  pending,
  onChange,
}: {
  value: UiLanguagePreference;
  pending: boolean;
  onChange: (value: UiLanguagePreference) => void;
}) {
  return (
    <section
      className="paper-panel overflow-hidden"
      aria-labelledby="language-title"
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
        <Languages className="mt-0.5 size-5" aria-hidden="true" />
        <div>
          <h2 id="language-title" className="font-semibold">
            语言与显示 / Language & display
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            默认采用中英双语；偏好会绑定到你的账号，并保存在当前设备。
          </p>
        </div>
      </div>
      <div
        className="grid gap-px bg-border sm:grid-cols-3"
        role="radiogroup"
        aria-label="界面语言"
      >
        {options.map(option => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => onChange(option.value)}
              className={`min-h-36 bg-card p-5 text-left transition-colors hover:bg-muted/45 disabled:cursor-wait ${selected ? "shadow-[inset_0_3px_0_0_var(--color-foreground)]" : ""}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-bold">
                    {option.title}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {option.englishTitle}
                  </span>
                </span>
                {selected ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : null}
              </span>
              <span className="mt-5 block text-xs leading-5 text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
