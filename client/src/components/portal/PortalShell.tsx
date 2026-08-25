import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";
import { collaborationApi } from "@/lib/collaboration-api";
import { useQueryClient } from "@tanstack/react-query";
import { Files, LogOut, Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

export function PortalShell({ children }: { children: ReactNode }) {
  const session = useCollaborationSession();
  const { copy } = useUiLanguage();
  const client = useQueryClient();
  const [location, setLocation] = useLocation();
  if (session.isLoading)
    return (
      <div className="min-h-[100dvh] bg-background p-6">
        <Skeleton className="mx-auto h-80 max-w-5xl" />
      </div>
    );
  if (!session.user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <ShieldCheck className="mx-auto size-10 text-primary" />
          <h1 className="mt-4 text-2xl font-semibold">
            {copy("Cofound 受控资料室", "Cofound controlled data room")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            只有受邀账号可以查看被明确授权的项目、字段和文件。
          </p>
          <Link href={`/login?next=${encodeURIComponent(location)}`}>
            <Button className="mt-6">
              {copy("邮箱登录", "Email sign in")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  const logout = async () => {
    await collaborationApi.logout();
    client.setQueryData(["collaboration", "session"], { user: null });
    setLocation("/login");
  };
  const internalViewer =
    session.user.role === "admin" || session.user.role === "internal";
  return (
    <div className="min-h-[100dvh] bg-background">
      {internalViewer ? <Navbar /> : null}
      <header
        className={`${internalViewer ? "sticky top-16 z-40" : "sticky top-0 z-50"} border-b border-border bg-card/95 backdrop-blur-md`}
      >
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-1 px-3 sm:gap-3 sm:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-signal/25 bg-signal/5">
              <ShieldCheck className="size-4 text-signal" />
            </span>
            <span className="hidden min-w-0 truncate sm:block">
              <span className="block text-sm font-semibold">
                {internalViewer
                  ? copy("企业共享项目库", "Shared portfolio")
                  : copy("Cofound 受控资料室", "Cofound data room")}
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                {internalViewer
                  ? `${session.user.name} | ${session.user.role === "admin" ? "管理员" : "内部成员"}`
                  : "按账号与项目授权"}
              </span>
            </span>
          </Link>
          <nav
            className="ml-auto flex items-center gap-1"
            aria-label={internalViewer ? "共享项目库导航" : "资料室导航"}
          >
            <Link href="/portal">
              <Button
                variant={location === "/portal" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Files className="size-4" />
                <span className="hidden sm:inline">
                  {copy("共享项目", "Shared projects")}
                </span>
              </Button>
            </Link>
            {!internalViewer ? (
              <Link href="/settings">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={copy("账户设置", "Account settings")}
                >
                  <Settings className="size-4" aria-hidden="true" />
                </Button>
              </Link>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              aria-label={`${session.user.name}退出登录`}
            >
              <LogOut className="size-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="app-page max-w-[1240px]">{children}</main>
    </div>
  );
}
