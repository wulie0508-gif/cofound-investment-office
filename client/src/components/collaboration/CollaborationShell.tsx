import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";
import {
  Activity,
  BadgeCheck,
  MessageSquareText,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

const tabs = [
  {
    href: "/collaboration",
    label: "共享项目",
    englishLabel: "Shared projects",
    icon: Users,
  },
  {
    href: "/collaboration/members",
    label: "成员与邀请",
    englishLabel: "Members",
    icon: ShieldAlert,
  },
  {
    href: "/collaboration/approvals",
    label: "下载审批",
    englishLabel: "Approvals",
    icon: BadgeCheck,
  },
  {
    href: "/collaboration/annotations",
    label: "批注收件箱",
    englishLabel: "Comments",
    icon: MessageSquareText,
  },
  {
    href: "/collaboration/audit",
    label: "任务与审计",
    englishLabel: "Audit",
    icon: Activity,
  },
];

export function CollaborationShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const session = useCollaborationSession({ bootstrapAdmin: true });
  const { copy, preference } = useUiLanguage();
  const [location] = useLocation();
  if (session.isLoading)
    return (
      <div className="min-h-[100dvh] bg-background">
        <Navbar />
        <main className="app-page space-y-5">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-80 w-full" />
        </main>
      </div>
    );
  if (session.error || !session.user || session.user.role !== "admin") {
    return (
      <div className="min-h-[100dvh] bg-background">
        <Navbar />
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <ShieldAlert className="mx-auto size-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">无法进入协作管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session.error instanceof Error
              ? session.error.message
              : "需要管理员权限"}
          </p>
          <Link href={`/login?next=${encodeURIComponent(location)}`}>
            <Button className="mt-5">
              {copy("使用邮箱验证码登录", "Sign in with email code")}
            </Button>
          </Link>
        </main>
      </div>
    );
  }
  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <div className="border-b border-border bg-card">
        <div
          className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
          aria-label="协作管理导航"
        >
          <div className="flex min-w-0 overflow-x-auto">
            {tabs.map(({ href, label, englishLabel, icon: Icon }) => {
              const active =
                href === "/collaboration"
                  ? location === href ||
                    location.startsWith("/collaboration/projects/")
                  : location.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex h-13 min-w-28 shrink-0 items-center gap-2.5 px-3 text-xs font-bold transition-colors ${active ? "bg-muted/70 text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-signal" : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"}`}
                >
                  <Icon className="size-4" />
                  <span className="leading-none">
                    <span className="block">
                      {preference === "en" ? englishLabel : label}
                    </span>
                    {preference === "bilingual" ? (
                      <span className="mt-1 block text-[9px] font-semibold tracking-[0.04em] text-muted-foreground">
                        {englishLabel}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
          <Link
            href="/settings"
            className="hidden shrink-0 items-center gap-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
            aria-label={copy("打开账户设置", "Open account settings")}
          >
            <span>
              <span className="block font-semibold text-foreground">
                {session.user.name} | {copy("管理员", "Admin")}
              </span>
              <span>{session.user.email}</span>
            </span>
            <Settings className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <main className="app-page">
        <header className="mb-6 grid gap-5 border-b border-foreground pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="finance-kicker">CONTROLLED COLLABORATION</p>
            <h1 className="page-heading mt-3">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}
