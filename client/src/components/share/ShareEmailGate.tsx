import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { shareApi } from "@/lib/share-api";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

type AccessMode = "passcode" | "member_email";

function AccessGateLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto mt-12 max-w-md border border-foreground bg-card p-6 sm:mt-20 sm:p-8">
      <span className="flex size-10 items-center justify-center border border-border bg-muted">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-6 text-[11px] font-semibold text-muted-foreground">
        受控项目访问 <span lang="en">Controlled Access</span>
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.035em]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {children}
    </section>
  );
}

function AccessCodeGate({
  token,
  onVerified,
}: {
  token: string;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const verify = useMutation({
    mutationFn: () => shareApi.passcodeVerify(token, code),
    onSuccess: () => {
      toast.success("访问码验证成功");
      onVerified();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <AccessGateLayout
      title="输入项目访问码"
      description="请输入分享方提供的六位数字访问码。此方式无需填写邮箱。"
    >
      <form
        className="mt-8"
        onSubmit={event => {
          event.preventDefault();
          verify.mutate();
        }}
      >
        <label className="block text-center text-xs font-semibold text-muted-foreground">
          六位数字访问码
          <span className="mt-3 flex justify-center">
            <InputOTP
              maxLength={6}
              pattern="^[0-9]+$"
              inputMode="numeric"
              value={code}
              onChange={setCode}
              autoFocus
              aria-label="六位数字项目访问码"
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-11 w-10 rounded-none shadow-none first:rounded-none last:rounded-none"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </span>
        </label>
        <Button
          className="mt-6 h-10 w-full gap-2"
          disabled={code.length !== 6 || verify.isPending}
        >
          <KeyRound className="size-4" aria-hidden="true" />
          {verify.isPending ? "正在验证…" : "验证并打开项目"}
        </Button>
      </form>
    </AccessGateLayout>
  );
}

function MemberEmailGate({
  token,
  providerConfigured,
  onVerified,
}: {
  token: string;
  providerConfigured: boolean;
  onVerified: () => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const requestCode = useMutation({
    mutationFn: () => shareApi.requestEmailOtp(token, email),
    onSuccess: result => {
      setStep("code");
      toast.success(`验证码已发送至 ${result.maskedEmail}`);
    },
    onError: error => toast.error(error.message),
  });
  const verifyCode = useMutation({
    mutationFn: () => shareApi.verifyEmailOtp(token, email, code),
    onSuccess: () => {
      toast.success("身份验证成功");
      onVerified();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <AccessGateLayout
      title={step === "email" ? "验证受邀邮箱" : "输入邮箱验证码"}
      description={
        step === "email"
          ? "此项目使用成员邮箱访问，仅向分享方指定的邮箱开放。"
          : `验证码已发送至 ${email}，10 分钟内有效。`
      }
    >
      {!providerConfigured ? (
        <div
          role="alert"
          className="mt-5 border border-destructive/40 p-3 text-sm text-destructive"
        >
          分享方尚未配置邮件验证码服务，暂时无法打开该项目。
        </div>
      ) : step === "email" ? (
        <form
          className="mt-7 space-y-4"
          onSubmit={event => {
            event.preventDefault();
            requestCode.mutate();
          }}
        >
          <label htmlFor="share-email" className="block text-sm font-medium">
            受邀邮箱
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="share-email"
              type="email"
              className="h-10 rounded-none pl-10 shadow-none"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </div>
          <Button
            className="h-10 w-full gap-2"
            disabled={requestCode.isPending}
          >
            <Mail className="size-4" aria-hidden="true" />
            {requestCode.isPending ? "正在发送…" : "发送验证码"}
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
              value={code}
              onChange={setCode}
              autoFocus
              aria-label="六位邮箱验证码"
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-11 w-10 rounded-none shadow-none first:rounded-none last:rounded-none"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button
            className="mt-6 h-10 w-full gap-2"
            disabled={code.length !== 6 || verifyCode.isPending}
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {verifyCode.isPending ? "正在验证…" : "验证并打开项目"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full gap-2 text-muted-foreground"
            onClick={() => {
              setStep("email");
              setCode("");
            }}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            更换邮箱
          </Button>
        </form>
      )}
    </AccessGateLayout>
  );
}

export function ShareAccessGate({
  token,
  accessMode,
  providerConfigured,
  onVerified,
}: {
  token: string;
  accessMode: AccessMode;
  providerConfigured: boolean;
  onVerified: () => void;
}) {
  if (accessMode === "passcode")
    return <AccessCodeGate token={token} onVerified={onVerified} />;

  return (
    <MemberEmailGate
      token={token}
      providerConfigured={providerConfigured}
      onVerified={onVerified}
    />
  );
}

export const ShareEmailGate = ShareAccessGate;
