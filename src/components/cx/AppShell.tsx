"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDashboard } from "./DashboardProvider";
import { Icon, type IconName } from "./icons";
import { Button, Spinner, Status, cx } from "./ui";
import { needsYou } from "@/lib/inbox";
import type { StringKey } from "@/lib/i18n";

type Tab = { href: string; labelKey: StringKey; icon: IconName };

const MAIN: Tab[] = [
  { href: "/today", labelKey: "nav.today", icon: "today" },
  { href: "/inbox", labelKey: "nav.inbox", icon: "inbox" },
  { href: "/contacts", labelKey: "nav.contacts", icon: "contacts" },
  { href: "/campaigns", labelKey: "nav.campaigns", icon: "campaigns" },
  { href: "/assistant", labelKey: "nav.assistant", icon: "assistant" },
];
const SYSTEM: Tab[] = [{ href: "/more", labelKey: "nav.more", icon: "settings" }];
const ALL = [...MAIN, { href: "/more", labelKey: "nav.more" as StringKey, icon: "more" as IconName }];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { business, loading, error, conversations, now, t, demo } = useDashboard();
  const waiting = conversations.filter((c) => needsYou(c, now)).length;
  const inChat = /^\/inbox\/.+/.test(pathname);

  if (loading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-3">
        <Spinner size={24} />
        <p className="eyebrow">Loading workspace</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="eyebrow !text-danger">Connection error</p>
        <p className="text-[14px] text-ink-soft max-w-sm">{error}</p>
        <Button variant="primary" onClick={() => location.reload()}>Retry</Button>
      </div>
    );
  }

  const badgeFor = (href: string) => (href === "/inbox" ? waiting : 0);

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-[244px] shrink-0 flex-col border-r border-line bg-surface">
        <Link href="/today" className="flex items-center gap-3 px-5 h-16 border-b border-line">
          <span className="w-9 h-9 rounded-[10px] bg-ink text-white flex items-center justify-center wordmark text-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.25)]">C</span>
          <span className="min-w-0">
            <span className="block wordmark text-[19px] leading-none text-ink">Cenexa</span>
            <span className="block eyebrow mt-1 !text-[9px]">ChatFlow · WhatsApp</span>
          </span>
        </Link>

        <div className="mx-3 mt-3 rounded-[12px] border border-line bg-canvas px-3 py-2.5">
          <p className="text-[13px] font-semibold truncate">{business?.name}</p>
          <div className="mt-1"><Status tone="success">WhatsApp live</Status></div>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-4">
          <p className="eyebrow px-2 mb-1.5">Workspace</p>
          {MAIN.map((tab) => (
            <SideItem key={tab.href} tab={tab} label={t(tab.labelKey)} active={pathname.startsWith(tab.href)} badge={badgeFor(tab.href)} />
          ))}
          <p className="eyebrow px-2 mb-1.5 mt-5">System</p>
          {SYSTEM.map((tab) => (
            <SideItem key={tab.href} tab={tab} label={t(tab.labelKey)} active={pathname.startsWith(tab.href)} badge={0} />
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-line flex items-center justify-between">
          <span className="eyebrow !text-[9px]">ChatFlow v2.0</span>
          {demo ? <Status tone="attention">Demo</Status> : <Status tone="success">Online</Status>}
        </div>
      </aside>

      {/* Icon rail (tablet) */}
      <nav aria-label="Main" className="hidden md:flex lg:hidden w-[72px] shrink-0 flex-col items-center border-r border-line bg-surface py-3 gap-1">
        <Link href="/today" className="w-10 h-10 rounded-[10px] bg-ink text-white flex items-center justify-center wordmark text-[18px] mb-3" aria-label="Cenexa">C</Link>
        {ALL.map((tab) => (
          <RailItem key={tab.href} tab={tab} label={t(tab.labelKey)} active={pathname.startsWith(tab.href)} badge={badgeFor(tab.href)} />
        ))}
      </nav>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {demo && (
          <div className="shrink-0 bg-ink text-white text-center h-7 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Demo mode · sample data · nothing is sent</span>
          </div>
        )}
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>

        {/* Bottom tab bar (phones). Hidden inside an open chat to give it room. */}
        <nav
          aria-label="Main"
          className={cx("md:hidden shrink-0 border-t border-line bg-surface grid grid-cols-6", inChat && "hidden")}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {ALL.map((tab) => {
            const active = pathname.startsWith(tab.href);
            const badge = badgeFor(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx("relative h-[58px] flex flex-col items-center justify-center gap-1", active ? "text-ink" : "text-ink-faint")}
              >
                {active && <span className="absolute top-0 inset-x-3 h-[2px] bg-ink rounded-b" />}
                <span className="relative">
                  <Icon name={tab.icon} size={21} strokeWidth={active ? 2.2 : 1.75} />
                  {badge > 0 && <Count n={badge} className="absolute -top-1.5 -right-3" />}
                </span>
                <span className={cx("text-[9.5px] leading-none tracking-[-0.01em] truncate max-w-full", active ? "font-bold" : "font-medium")}>{t(tab.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function Count({ n, className, inverted }: { n: number; className?: string; inverted?: boolean }) {
  return (
    <span className={cx("min-w-[18px] h-[18px] px-1 rounded-md text-[10.5px] font-bold flex items-center justify-center tabular", inverted ? "bg-white text-ink" : "bg-attention text-white", className)}>
      {n}
    </span>
  );
}

function SideItem({ tab, label, active, badge }: { tab: Tab; label: string; active: boolean; badge: number }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 h-10 px-2.5 rounded-[10px] text-[13px] transition-colors duration-150 mb-0.5",
        active ? "bg-ink text-white font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.18)]" : "text-ink-soft font-medium hover:bg-sunken hover:text-ink"
      )}
    >
      <Icon name={tab.icon} size={18} />
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && <Count n={badge} inverted={active} />}
    </Link>
  );
}

function RailItem({ tab, label, active, badge }: { tab: Tab; label: string; active: boolean; badge: number }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cx(
        "relative w-12 h-12 rounded-[12px] flex items-center justify-center transition-colors duration-150",
        active ? "bg-ink text-white" : "text-ink-faint hover:bg-sunken hover:text-ink"
      )}
    >
      <Icon name={tab.icon} size={20} />
      <span className="sr-only">{label}</span>
      {badge > 0 && <Count n={badge} className="absolute -top-0.5 -right-0.5" />}
    </Link>
  );
}
