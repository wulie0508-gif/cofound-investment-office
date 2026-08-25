import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { collaborationApi } from "@/lib/collaboration-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Login() {
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const { copy, setPreference } = useUiLanguage();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const next =
    new URLSearchParams(window.location.search).get("next") || "/portal";
  const status = useQuery({
    queryKey: ["auth", "email-otp-status"],
    queryFn: collaborationApi.emailOtpStatus,
  });
  const requestCode = useMutation({
    mutationFn: () => collaborationApi.requestEmailOtp(email, name),
    onSuccess: result => {
      setStep("verify");
      if (result.previewCode) {
        setToken(result.previewCode);
        toast.success(`本机测试验证码：${result.previewCode}`, {
          duration: 12_000,
        });
      } else {
        toast.success(`验证码已发送至 ${result.maskedEmail}`);
      }
    },
    onError: error => toast.error(error.message),
  });
  const verifyCode = useMutation({
    mutationFn: () => collaborationApi.verifyEmailOtp(email, token, name),
    onSuccess: data => {
      client.setQueryData(["collaboration", "session"], data);
      setPreference(data.user.languagePreference);
      setLocation(next.startsWith("/") ? next : "/portal");
    },
    onError: error => toast.error(error.message),
  });
  const unavailable = status.data?.mode === "unavailable";
  const needsName = Boolean(status.data?.needsLocalAdminSetup);

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-2">
      <aside className="hidden border-r border-border bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3 text-sm font-bold">
          <span className="flex size-9 items-center justify-center rounded-md border border-white/30">
            CF
          </span>
          COFOUND INVESTMENT OFFICE
        </Link>
        <div className="max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-background/55">
            VERIFIED COLLABORATION
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em]">
            每次发布、查看与批注，都对应一个可识别的人。
          </h1>
          <p className="mt-5 text-sm leading-7 text-background/60">
            邮箱只用于验证身份和权限。项目、字段与文件仍按管理员明确配置的边界开放。
          </p>
        </div>
        <p className="text-xs text-background/70">Cofound | Confidential</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-md border border-border bg-card lg:hidden">
              <ShieldCheck className="size-5" />
            </span>
            <Link
              href="/"
              className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              返回本地工作台
            </Link>
          </div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            SECURE ACCESS
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
            {step === "request"
              ? copy("邮箱验证登录", "Email verification")
              : copy("输入 6 位验证码", "Enter the 6-digit code")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {step === "request"
              ? needsName
                ? "首次使用请绑定你的邮箱和姓名。以后审计记录会显示该身份。"
                : "使用管理员邀请的邮箱登录，无需记住密码。"
              : `验证码已发送至 ${email}，10 分钟内有效。`}
          </p>

          {status.data?.mode === "local_preview" ? (
            <div className="mt-5 border border-border bg-muted/45 px-4 py-3 text-xs leading-5 text-muted-foreground">
              当前为本机测试模式，验证码会显示在此设备上。配置 Supabase
              后将改为真实邮件发送。
            </div>
          ) : null}
          {unavailable ? (
            <div
              role="alert"
              className="mt-5 border border-destructive/40 px-4 py-3 text-sm text-destructive"
            >
              邮箱验证码服务尚未配置，请联系管理员。
            </div>
          ) : null}

          {step === "request" ? (
            <form
              className="mt-7 space-y-4"
              onSubmit={event => {
                event.preventDefault();
                requestCode.mutate();
              }}
            >
              <label
                className="block text-sm font-medium"
                htmlFor="login-email"
              >
                {copy("工作邮箱", "Work email")}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-email"
                  className="pl-10"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  required
                />
              </div>
              <label className="block text-sm font-medium" htmlFor="login-name">
                {copy("姓名或常用昵称", "Display name")}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {needsName ? "首次绑定必填" : "可选"}
                </span>
              </label>
              <Input
                id="login-name"
                autoComplete="name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={copy("例如：小明", "Example: Alex")}
                required={needsName}
              />
              <Button
                className="w-full gap-2"
                disabled={
                  requestCode.isPending || status.isLoading || unavailable
                }
              >
                <Mail className="size-4" />
                {requestCode.isPending
                  ? copy("正在发送…", "Sending…")
                  : copy("发送验证码", "Send code")}
              </Button>
            </form>
          ) : (
            <form
              className="mt-8"
              onSubmit={event => {
                event.preventDefault();
                verifyCode.mutate();
              }}
            >
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={token}
                  onChange={setToken}
                  autoFocus
                  aria-label="六位邮箱验证码"
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                className="mt-6 w-full gap-2"
                disabled={token.length !== 6 || verifyCode.isPending}
              >
                <KeyRound className="size-4" />
                {verifyCode.isPending
                  ? copy("正在验证…", "Verifying…")
                  : copy("验证并进入", "Verify and continue")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full gap-2 text-muted-foreground"
                onClick={() => {
                  setStep("request");
                  setToken("");
                }}
              >
                <ArrowLeft className="size-4" />
                {copy("更换邮箱", "Use another email")}
              </Button>
            </form>
          )}
          <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
            未收到邀请的邮箱无法进入；Codex 账号不会替代网站身份。
          </p>
        </div>
      </main>
    </div>
  );
}
