import { LinkShareShell } from "@/components/share/LinkShareShell";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileSearch, Link2, MessageSquareText } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";

export default function HostedLanding() {
  const [, navigate] = useLocation();
  const [access, setAccess] = useState("");
  const [error, setError] = useState("");

  const openShare = (event: FormEvent) => {
    event.preventDefault();
    const value = access.trim();
    let token = /^[A-Za-z0-9_-]{20,}$/u.test(value) ? value : "";
    if (!token) {
      try {
        const url = new URL(value, window.location.origin);
        token =
          url.pathname.match(/^\/share\/([A-Za-z0-9_-]{20,})\/?$/u)?.[1] ?? "";
      } catch {
        token = "";
      }
    }
    if (!token) {
      setError("请输入完整的单项目分享链接或有效访问码。");
      return;
    }
    setError("");
    navigate(`/share/${token}`);
  };

  return (
    <LinkShareShell>
      <div className="grid min-h-[calc(100vh-7.5rem)] border-x border-b border-border bg-card lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
        <section className="flex flex-col justify-between border-b border-border p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-14">
          <div>
            <p className="finance-kicker">
              PRIVATE MARKETS / CONTROLLED ACCESS
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              单项目资料室
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Cofound
              团队仅发布经过选择的项目字段和文件版本。这里没有公开目录，也不能搜索或推测其他项目。
            </p>
          </div>

          <div className="mt-14 grid gap-px border border-border bg-border sm:grid-cols-3">
            {[
              {
                icon: Link2,
                code: "01",
                title: "项目隔离",
                text: "链接仅对应一份发布快照。",
              },
              {
                icon: FileSearch,
                code: "02",
                title: "受控查看",
                text: "原文件在线打开，无下载按钮。",
              },
              {
                icon: MessageSquareText,
                code: "03",
                title: "批注同步",
                text: "项目反馈自动回到管理端。",
              },
            ].map(({ icon: Icon, code, title, text }) => (
              <div key={title} className="bg-card p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <Icon className="size-4 text-foreground" aria-hidden="true" />
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {code}
                  </span>
                </div>
                <h2 className="mt-6 text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </section>

        <aside className="flex flex-col justify-center bg-muted/35 p-6 sm:p-10 lg:p-12">
          <p className="finance-kicker">ACCESS A PUBLISHED PROJECT</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em]">
            打开已获授权的项目
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            粘贴邮件或消息中收到的完整分享链接；也可以只输入链接末尾的访问码。
          </p>
          <form className="mt-7" onSubmit={openShare}>
            <label htmlFor="share-access" className="finance-kicker">
              分享链接 / 访问码
            </label>
            <textarea
              id="share-access"
              value={access}
              onChange={event => setAccess(event.target.value)}
              rows={3}
              className="mt-2 w-full resize-none border border-input bg-card p-3 font-mono text-xs leading-5 text-foreground placeholder:text-muted-foreground/70 focus:border-foreground"
              placeholder="https://…/share/…"
              aria-describedby={error ? "access-error" : "access-note"}
            />
            {error ? (
              <p
                id="access-error"
                role="alert"
                className="mt-2 text-xs text-destructive"
              >
                {error}
              </p>
            ) : (
              <p
                id="access-note"
                className="mt-2 text-[11px] leading-5 text-muted-foreground"
              >
                访问码只在浏览器中用于打开对应项目，不会列出任何其他项目。
              </p>
            )}
            <Button type="submit" className="mt-5 w-full justify-between">
              验证并打开
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </form>
          <div className="mt-8 border-t border-border pt-4 font-mono text-[9px] uppercase leading-5 tracking-[0.1em] text-muted-foreground">
            No public directory
            <br />
            No open download endpoint
          </div>
        </aside>
      </div>
    </LinkShareShell>
  );
}
