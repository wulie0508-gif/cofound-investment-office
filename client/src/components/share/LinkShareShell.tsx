import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

export function LinkShareShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background font-sans text-foreground">
      <header className="border-b border-white/15 bg-foreground text-background">
        <div className="mx-auto flex h-14 max-w-[1520px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center border border-white/40 font-mono text-[10px] font-bold tracking-wider">
              CF
            </span>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[12px] font-semibold tracking-[0.02em] sm:text-[13px] sm:tracking-[0.03em]">
                COFOUND DEAL ROOM
              </p>
              <p className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-white/50 sm:block">
                Selected Project Access
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-white/65">
            <LockKeyhole
              className="size-3.5 text-white/72"
              aria-hidden="true"
            />
            受控访问
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {children}
      </main>
    </div>
  );
}
