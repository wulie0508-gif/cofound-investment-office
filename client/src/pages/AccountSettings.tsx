import Navbar from "@/components/Navbar";
import {
  AccountProfilePanel,
  AdminFieldSettings,
  SessionSecurityPanel,
} from "@/components/settings/AccountPanels";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";
import { collaborationApi } from "@/lib/collaboration-api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function AccountSettings() {
  const session = useCollaborationSession();
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const { setPreference, copy } = useUiLanguage();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!session.user) return;
    setName(session.user.name);
    setPreference(session.user.languagePreference);
  }, [session.user, setPreference]);

  const saveName = useMutation({
    mutationFn: () => collaborationApi.updateProfile({ name }),
    onSuccess: data => {
      client.setQueryData(["collaboration", "session"], data);
      toast.success(copy("个人名称已更新", "Display name updated"));
    },
    onError: error => toast.error(error.message),
  });
  const logout = useMutation({
    mutationFn: collaborationApi.logout,
    onSuccess: () => {
      client.setQueryData(["collaboration", "session"], { user: null });
      setLocation("/login");
    },
    onError: error => toast.error(error.message),
  });

  if (session.isLoading)
    return (
      <div className="min-h-[100dvh] bg-background">
        <Navbar />
        <main className="mx-auto max-w-6xl space-y-5 px-4 py-10 sm:px-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-80 w-full" />
        </main>
      </div>
    );
  if (!session.user)
    return (
      <div className="min-h-[100dvh] bg-background">
        <Navbar />
        <main className="mx-auto max-w-lg px-4 py-20 text-center">
          <Settings2 className="mx-auto size-10" aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-semibold">
            {copy("账户设置", "Account settings")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {copy(
              "请先通过邮箱验证码确认身份。",
              "Verify your identity by email before opening settings."
            )}
          </p>
          <Link href="/login?next=/settings">
            <Button className="mt-6">
              {copy("邮箱登录", "Email sign in")}
            </Button>
          </Link>
        </main>
      </div>
    );

  const user = session.user;
  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar audience={user.role === "external" ? "external" : "internal"} />
      <main className="app-page max-w-[1240px]">
        <header className="flex flex-col justify-between gap-5 border-b border-foreground pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="finance-kicker">ACCOUNT & SETTINGS</p>
            <h1 className="page-heading mt-3">
              {copy("个人账户与设置", "Account & settings")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {copy(
                "管理你的可识别身份、语言偏好和当前登录状态。",
                "Manage your verified identity, language and current session."
              )}
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 self-start sm:self-auto"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut className="size-4" aria-hidden="true" />
            {copy("退出登录", "Sign out")}
          </Button>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
          <AccountProfilePanel
            user={user}
            name={name}
            pending={saveName.isPending}
            copy={copy}
            onNameChange={setName}
            onSubmit={() => saveName.mutate()}
          />
          <SessionSecurityPanel copy={copy} />
        </div>

        {user.role === "admin" ? <AdminFieldSettings copy={copy} /> : null}
      </main>
    </div>
  );
}
