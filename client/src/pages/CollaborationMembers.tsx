import { CollaborationShell } from "@/components/collaboration/CollaborationShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collaborationApi } from "@/lib/collaboration-api";
import { collaborationLabel } from "@/lib/collaboration-labels";
import { formatDate } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MailPlus, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";

export default function CollaborationMembers() {
  const session = useCollaborationSession({ bootstrapAdmin: true });
  const enabled = session.user?.role === "admin";
  const client = useQueryClient();
  const users = useQuery({
    queryKey: ["collaboration", "users"],
    queryFn: collaborationApi.users,
    enabled,
  });
  const invitations = useQuery({
    queryKey: ["collaboration", "invitations"],
    queryFn: collaborationApi.invitations,
    enabled,
  });
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "external" as "internal" | "external",
  });
  const [latestLink, setLatestLink] = useState("");
  const invite = useMutation({
    mutationFn: () => collaborationApi.invite(form),
    onSuccess: value => {
      setLatestLink(value.inviteUrl ?? "");
      setForm({ name: "", email: "", role: "external" });
      client.invalidateQueries({ queryKey: ["collaboration", "invitations"] });
      toast.success("邀请已生成");
    },
    onError: error => toast.error(error.message),
  });
  const setState = useMutation({
    mutationFn: ({
      id,
      state,
    }: {
      id: string;
      state: "active" | "suspended";
    }) => collaborationApi.setUserState(id, state),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["collaboration", "users"] });
      toast.success("成员状态已更新");
    },
    onError: error => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: collaborationApi.revokeInvitation,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["collaboration", "invitations"] });
      toast.success("邀请已撤销");
    },
    onError: error => toast.error(error.message),
  });
  const copy = async () => {
    await navigator.clipboard.writeText(latestLink);
    toast.success("邀请链接已复制");
  };
  return (
    <CollaborationShell
      title="成员与邀请"
      description="网站账号与 Codex 账号相互独立。外部人员只获得被分配项目的浏览权限，不会接触本地资料库。"
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-border/80 bg-card p-5 lg:col-span-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <MailPlus className="size-4 text-primary" />
            创建邀请
          </h2>
          <div className="mt-4 space-y-3">
            <label className="block text-xs text-muted-foreground">
              姓名
              <Input
                className="mt-1"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              邮箱
              <Input
                className="mt-1"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              身份
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={form.role}
                onChange={e =>
                  setForm({ ...form, role: e.target.value as typeof form.role })
                }
              >
                <option value="external">外部受邀用户</option>
                <option value="internal">内部团队成员</option>
              </select>
            </label>
            <Button
              className="w-full"
              disabled={invite.isPending || !form.name || !form.email}
              onClick={() => invite.mutate()}
            >
              登记并生成邀请
            </Button>
          </div>
          {latestLink && (
            <div className="mt-5 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-primary">
                <Check className="size-3.5" />
                链接只在本次创建后显示
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {latestLink}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 gap-2"
                onClick={copy}
              >
                <Copy className="size-3.5" />
                复制
              </Button>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            邀请登记后，对方可直接在资料室使用该邮箱获取验证码。备用邀请链接仍可复制发送。
          </p>
        </section>
        <div className="space-y-6 lg:col-span-8">
          <section className="rounded-xl border border-border/80 bg-card">
            <div className="border-b border-border/70 px-5 py-4">
              <h2 className="font-semibold">有效成员</h2>
            </div>
            <div className="divide-y divide-border/60">
              {users.data?.map(user => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserRound className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge variant="outline">
                      {collaborationLabel(user.role)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        user.state === "active"
                          ? "border-primary/30 text-primary"
                          : ""
                      }
                    >
                      {collaborationLabel(user.state)}
                    </Badge>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {user.grants} 个项目
                    </span>
                    {user.role !== "admin" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setState.mutate({
                            id: user.id,
                            state:
                              user.state === "active" ? "suspended" : "active",
                          })
                        }
                      >
                        {user.state === "active" ? "停用" : "恢复"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-border/80 bg-card">
            <div className="border-b border-border/70 px-5 py-4">
              <h2 className="font-semibold">邀请记录</h2>
            </div>
            {invitations.data?.length ? (
              <div className="divide-y divide-border/60">
                {invitations.data.map(item => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {item.name} · {item.email}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {collaborationLabel(item.role)} · 创建于{" "}
                        {formatDate(item.createdAt)} · 到期{" "}
                        {formatDate(item.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          item.state === "accepted"
                            ? "border-primary/30 text-primary"
                            : ""
                        }
                      >
                        {collaborationLabel(item.state)}
                      </Badge>
                      {item.state === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revoke.mutate(item.id)}
                        >
                          撤销
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                尚无邀请记录。
              </div>
            )}
          </section>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-primary" />
              权限规则
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              管理员必须在具体项目里再次勾选成员，并分别授予“字段、文件、下载申请”权限。创建账号本身不会自动看到任何
              BP。
            </p>
          </div>
        </div>
      </div>
    </CollaborationShell>
  );
}
