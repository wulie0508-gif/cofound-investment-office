import { Button } from "@/components/ui/button";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { trpc } from "@/lib/trpc";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  FolderLock,
  Globe2,
  Plus,
  MessageSquareText,
  Share2,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";

type NavItem = {
  href: string;
  label: string;
  englishLabel: string;
  icon: LucideIcon;
  active: boolean;
};

function NavLabel({
  label,
  englishLabel,
}: {
  label: string;
  englishLabel: string;
}) {
  const { preference } = useUiLanguage();
  if (preference === "zh-CN") return <span>{label}</span>;
  if (preference === "en") return <span>{englishLabel}</span>;
  return (
    <span className="leading-none">
      <span className="block text-[13px]">{label}</span>
      <span className="mt-1 block text-[9px] font-semibold tracking-[0.04em] text-muted-foreground">
        {englishLabel}
      </span>
    </span>
  );
}

export default function Navbar({
  audience = "internal",
}: {
  audience?: "internal" | "external";
}) {
  const [location] = useLocation();
  const { copy, preference } = useUiLanguage();
  const localWorkspace = ["127.0.0.1", "localhost"].includes(
    window.location.hostname
  );
  const feedbackCapabilities = trpc.productFeedback.capabilities.useQuery(
    undefined,
    {
      enabled: localWorkspace && audience === "internal",
      retry: false,
      staleTime: 60_000,
    }
  );
  const maintainerMode = feedbackCapabilities.data?.maintainerMode === true;
  const internalItems: NavItem[] = [
    {
      href: "/",
      label: "本地项目",
      englishLabel: "Projects",
      icon: BriefcaseBusiness,
      active: location === "/" || location.startsWith("/projects"),
    },
    {
      href: "/internal-storage",
      label: "资料归档",
      englishLabel: "File archive",
      icon: FolderLock,
      active: location.startsWith("/internal-storage"),
    },
    {
      href: "/collaboration",
      label: "外部分享",
      englishLabel: "External sharing",
      icon: Share2,
      active: location.startsWith("/collaboration"),
    },
    ...(localWorkspace
      ? [
          {
            href: "/feedback",
            label: "问题反馈",
            englishLabel: "Feedback",
            icon: MessageSquareText,
            active: location.startsWith("/feedback"),
          },
        ]
      : []),
    ...(localWorkspace && maintainerMode
      ? [
          {
            href: "/improvements",
            label: "维护者迭代台",
            englishLabel: "Maintainer",
            icon: Sparkles,
            active: location.startsWith("/improvements"),
          },
        ]
      : []),
  ];
  const navItems: NavItem[] =
    audience === "external"
      ? [
          {
            href: "/portal",
            label: "共享项目",
            englishLabel: "Shared projects",
            icon: Globe2,
            active: location.startsWith("/portal"),
          },
        ]
      : internalItems;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-stretch px-3 sm:px-5 lg:px-7">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 pr-4 text-foreground sm:pr-7"
          aria-label="Cofound Investment Office 首页"
        >
          <span className="flex size-9 items-center justify-center rounded-md bg-foreground text-[10px] font-extrabold tracking-[0.12em] text-background">
            CF
          </span>
          <span className="hidden sm:block">
            <span className="block text-[13px] font-extrabold leading-none tracking-[-0.01em]">
              COFOUND
            </span>
            <span className="mt-1 block text-[9px] font-bold tracking-[0.1em] text-muted-foreground">
              INVESTMENT OFFICE
            </span>
          </span>
        </Link>

        <nav
          className="hidden min-w-0 items-stretch border-l border-border lg:flex"
          aria-label="主要导航"
        >
          {navItems.map(({ href, label, englishLabel, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative inline-flex min-w-32 items-center gap-2.5 border-r border-border px-4 font-semibold transition-colors ${
                active
                  ? "bg-foreground text-background after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:bg-signal"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              <NavLabel label={label} englishLabel={englishLabel} />
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 border-r border-border pr-3 xl:flex">
            <span
              className="size-1.5 rounded-full bg-signal"
              aria-hidden="true"
            />
            <span className="text-[11px] font-bold text-muted-foreground">
              {audience === "external"
                ? copy("受控访问", "Controlled access")
                : copy("本机已连接", "Local connected")}
            </span>
          </div>
          {audience === "internal" ? (
            <>
              <Link
                href="/internal-storage"
                className="hidden sm:block lg:hidden"
                aria-label={copy("资料归档", "File archive")}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className={
                    location.startsWith("/internal-storage")
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  <FolderLock className="size-4" aria-hidden="true" />
                </Button>
              </Link>
              <Link
                href="/collaboration"
                className="lg:hidden"
                aria-label={copy("外部分享", "External sharing")}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className={
                    location.startsWith("/collaboration")
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  <Share2 className="size-4" aria-hidden="true" />
                </Button>
              </Link>
              {localWorkspace ? (
                <Link
                  href="/feedback"
                  className="lg:hidden"
                  aria-label={copy("问题反馈", "Feedback")}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className={
                      location.startsWith("/feedback")
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    <MessageSquareText className="size-4" aria-hidden="true" />
                  </Button>
                </Link>
              ) : null}
              {localWorkspace && maintainerMode ? (
                <Link
                  href="/improvements"
                  className="lg:hidden"
                  aria-label={copy("维护者迭代台", "Maintainer workspace")}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className={
                      location.startsWith("/improvements")
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    <Sparkles className="size-4" aria-hidden="true" />
                  </Button>
                </Link>
              ) : null}
            </>
          ) : null}
          {audience === "internal" ? (
            <Link href="/projects/new">
              <Button
                size="sm"
                className="size-9 gap-2 px-0 sm:h-8 sm:w-auto sm:px-3.5"
                aria-label={copy("导入 BP", "Import BP")}
              >
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {preference === "en" ? "Import" : "导入 BP"}
                </span>
                <ArrowUpRight
                  className="hidden size-3 sm:block"
                  aria-hidden="true"
                />
              </Button>
            </Link>
          ) : null}
          <Link
            href="/settings"
            aria-label={copy("账户设置", "Account settings")}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label={copy("账户设置", "Account settings")}
              className={
                location.startsWith("/settings")
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
              }
            >
              <Settings className="size-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
