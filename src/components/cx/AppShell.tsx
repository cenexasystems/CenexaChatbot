"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDashboard } from "./DashboardProvider";
import { Icon, type IconName } from "./icons";
import { Button, Spinner, cx } from "./ui";
import { needsYou } from "@/lib/inbox";
import type { StringKey } from "@/lib/i18n";

const TABS: { href: string; labelKey: StringKey; icon: IconName }[] = [
  { href: "/today", labelKey: "nav.today", icon: "today" },
  { href: "/inbox", labelKey: "nav.inbox", icon: "inbox" },
  { href: "/contacts", labelKey: "nav.contacts", icon: "contacts" },
  { href: "/campaigns", labelKey: "nav.campaigns", icon: "campaigns" },
  { href: "/assistant", labelKey: "nav.assistant", icon: "assistant" },
  { href: "/more", labelKey: "nav.more", icon: "more" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { business, loading, error, conversations, now, t, demo } = useDashboard();
  const waiting = conversations.filter((c) => needsYou(c, now)).length;
  const inChat = /^\/inbox\/.+/.test(pathname);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[17px] font-semibold">Something went wrong</p>
        <p className="text-ink-soft">{error}</p>
        <Button variant="primary" onClick={() => location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden">
      {/* Left rail (tablet and desktop) */}
      <nav aria-label="Main" className="hidden md:flex w-[84px] shrink-0 flex-col items-center border-r border-line bg-surface py-3 gap-1">
        <Link href="/today" className="w-11 h-11 rounded-[12px] bg-accent text-white flex items-center justify-center font-bold text-[17px] mb-3" aria-label={business?.name ?? "Home"}>
          {(business?.name ?? "C").slice(0, 1)}
        </Link>
        {TABS.map((tab) => (
          <NavItem key={tab.href} href={tab.href} icon={tab.icon} label={t(tab.labelKey)} active={pathname.startsWith(tab.href)} badge={tab.href === "/inbox" ? waiting : 0} layout="rail" />
        ))}
      </nav>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {demo && (
          <div className="shrink-0 bg-attention-tint text-attention text-[13px] text-center py-1.5 px-4">
            Demo data. Nothing is sent to WhatsApp.
          </div>
        )}
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>

        {/* Bottom tab bar (phones). Hidden inside an open chat to give it room. */}
        <nav
          aria-label="Main"
          className={cx("md:hidden shrink-0 border-t border-line bg-surface grid grid-cols-6", inChat && "hidden")}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {TABS.map((tab) => (
            <NavItem key={tab.href} href={tab.href} icon={tab.icon} label={t(tab.labelKey)} active={pathname.startsWith(tab.href)} badge={tab.href === "/inbox" ? waiting : 0} layout="bar" />
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
  badge,
  layout,
}: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
  badge: number;
  layout: "rail" | "bar";
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex flex-col items-center justify-center gap-1 transition-colors duration-150",
        layout === "rail" ? "w-[68px] h-[60px] rounded-[12px]" : "h-16",
        active ? "text-accent" : "text-ink-soft hover:text-ink",
        layout === "rail" && active && "bg-accent-tint"
      )}
    >
      <span className="relative">
        <Icon name={icon} size={22} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-attention text-white text-[11px] font-semibold flex items-center justify-center tabular">
            {badge}
          </span>
        )}
      </span>
      <span className={cx("text-[11px] leading-tight text-center truncate max-w-full px-0.5", active ? "font-semibold" : "font-medium")}>{label}</span>
    </Link>
  );
}
