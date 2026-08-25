import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound } from "lucide-react";
import { FormEvent, useState } from "react";

const DEMO_ACCESS_CODE = "284731";

export function ShareDemoAccessGate({
  onVerified,
}: {
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code === DEMO_ACCESS_CODE) {
      setError("");
      onVerified();
      return;
    }
    setError("访问码不正确，请输入演示访问码 284731。");
  }

  return (
    <section className="mx-auto mt-10 max-w-md border border-border bg-card p-6 sm:mt-16 sm:p-8">
      <KeyRound className="size-5 text-signal" aria-hidden="true" />
      <p className="finance-kicker mt-5">PROJECT ACCESS</p>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.035em]">
        输入六位访问码
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        这是单项目分享入口。链接只能定位项目，仍需访问码才能打开本次授权内容。
      </p>

      <form className="mt-6" onSubmit={verify}>
        <label htmlFor="demo-access-code" className="text-xs font-semibold">
          六位数字访问码
        </label>
        <Input
          id="demo-access-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={event => {
            setCode(event.target.value.replace(/\D/gu, "").slice(0, 6));
            setError("");
          }}
          placeholder="284731"
          className="mt-2 h-11 font-mono text-base tracking-[0.3em]"
          aria-describedby="demo-access-help demo-access-error"
        />
        <p id="demo-access-help" className="mt-2 text-xs text-muted-foreground">
          演示访问码：284731
        </p>
        {error ? (
          <p
            id="demo-access-error"
            role="alert"
            className="mt-2 text-xs font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" className="mt-5 w-full">
          验证并打开项目
        </Button>
      </form>
    </section>
  );
}
