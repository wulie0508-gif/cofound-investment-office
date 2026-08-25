import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collaborationApi } from "@/lib/collaboration-api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

export default function InviteAccept() {
  const { token = "" } = useParams<{ token: string }>();
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const accept = useMutation({
    mutationFn: () => {
      if (password !== confirm) throw new Error("两次输入的密码不一致");
      return collaborationApi.acceptInvite(token, password);
    },
    onSuccess: data => {
      client.setQueryData(["collaboration", "session"], data);
      toast.success("账号已激活");
      setLocation("/portal");
    },
    onError: error => toast.error(error.message),
  });
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-6 sm:p-8">
        <span className="flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
          <ShieldCheck className="size-5 text-primary" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">接受 Cofound 资料室邀请</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          设置独立网站密码后才能查看管理员分配给你的项目。密码至少 10 个字符。
        </p>
        <form
          className="mt-7 space-y-4"
          onSubmit={event => {
            event.preventDefault();
            accept.mutate();
          }}
        >
          <label className="block text-sm">
            设置密码
            <Input
              className="mt-2"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            确认密码
            <Input
              className="mt-2"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </label>
          <Button
            className="w-full gap-2"
            disabled={accept.isPending || password.length < 10}
          >
            <CheckCircle2 className="size-4" />
            {accept.isPending ? "正在激活…" : "激活并进入资料室"}
          </Button>
        </form>
      </div>
    </main>
  );
}
