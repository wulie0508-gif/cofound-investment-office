import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collaborationLabel } from "@/lib/collaboration-labels";
import type { SessionUser } from "@shared/collaboration";
import { ArrowUpRight, Database, MailCheck, UserRound } from "lucide-react";
import { Link } from "wouter";

type Copy = (chinese: string, english: string) => string;

export function AccountProfilePanel({
  user,
  name,
  pending,
  copy,
  onNameChange,
  onSubmit,
}: {
  user: SessionUser;
  name: string;
  pending: boolean;
  copy: Copy;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section
      className="paper-panel overflow-hidden"
      aria-labelledby="profile-title"
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
        <UserRound className="mt-0.5 size-5" aria-hidden="true" />
        <div>
          <h2 id="profile-title" className="font-semibold">
            {copy("个人资料", "Personal profile")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy(
              "用于发布、批注和审计记录",
              "Used in publishing, comments and audit logs"
            )}
          </p>
        </div>
      </div>
      <form
        className="space-y-5 p-5 sm:p-6"
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div>
          <label htmlFor="account-name" className="text-sm font-semibold">
            {copy("姓名或常用昵称", "Display name")}
          </label>
          <Input
            id="account-name"
            className="mt-2"
            value={name}
            onChange={event => onNameChange(event.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <span className="text-sm font-semibold">
            {copy("已验证邮箱", "Verified email")}
          </span>
          <div className="mt-2 flex min-h-10 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm">
            <MailCheck className="size-4" aria-hidden="true" />
            <span className="truncate">{user.email}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">
            {copy("账户角色", "Account role")} | {collaborationLabel(user.role)}
          </p>
          <Button disabled={pending || !name.trim()}>
            {pending
              ? copy("正在保存…", "Saving…")
              : copy("保存资料", "Save profile")}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function SessionSecurityPanel({ copy }: { copy: Copy }) {
  return (
    <aside className="paper-panel p-5 sm:p-6">
      <p className="finance-kicker">VERIFIED SESSION</p>
      <h2 className="mt-3 font-semibold">
        {copy("邮箱验证码登录", "Email OTP sign-in")}
      </h2>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {copy(
          "本机测试使用可见验证码；线上启用 Supabase 后由邮件发送。正式外发建议配置自有 SMTP。",
          "Local testing uses a visible code. Production delivery uses Supabase with a custom SMTP provider recommended."
        )}
      </p>
      <div className="mt-6 border-t border-border pt-5 text-xs text-muted-foreground">
        {copy("会话有效期", "Session duration")} | 7 days
      </div>
    </aside>
  );
}

export function AdminFieldSettings({ copy }: { copy: Copy }) {
  return (
    <section className="paper-panel mt-6 flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="flex items-start gap-3">
        <Database className="mt-0.5 size-5" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">
            {copy("项目数据设置", "Project data settings")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {copy(
              "维护系统预置字段，并继续添加团队自己的管理字段。",
              "Manage system fields and add team-specific fields."
            )}
          </p>
        </div>
      </div>
      <Link href="/settings/fields">
        <Button variant="outline" className="gap-2">
          {copy("字段设置", "Field settings")}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Button>
      </Link>
    </section>
  );
}
