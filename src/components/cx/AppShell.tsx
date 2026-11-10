"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDashboard } from "./DashboardProvider";
import { Icon, type IconName } from "./icons";
import { Button, Spinner, cx } from "./ui";
import { needsYou } from "@/lib/inbox";
import { logout } from "@/app/login/actions";
import type { StringKey } from "@/lib/i18n";

type Tab = { href: string; labelKey: StringKey; icon: IconName };

const MAIN: Tab[] = [
  { href: "/today", labelKey: "nav.today", icon: "today" },
  { href: "/inbox", labelKey: "nav.inbox", icon: "inbox" },
  { href: "/contacts", labelKey: "nav.contacts", icon: "contacts" },
  { href: "/campaigns", labelKey: "nav.campaigns", icon: "campaigns" },
  { href: "/assistant", labelKey: "nav.assistant", icon: "assistant" },
  { href: "/more", labelKey: "nav.more", icon: "settings" },
];

/** Cenexa mark in a white tile, as in the logo. */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center bg-white rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.25)] shrink-0" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/cenexa-mark.png" alt="" width={size - 10} height={size - 10} className="object-contain" />
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { business, loading, error, conversations, now, t, demo, role } = useDashboard();
  const waiting = conversations.filter((c) => needsYou(c, now)).length;
  const inChat = /^\/inbox\/.+/.test(pathname);
  const visibleMain = MAIN.filter((tab) => {
    if (tab.href === "/campaigns") return role === "admin";
    if (tab.href === "/contacts") return role === "admin" || role === "sales";
    if (tab.href === "/assistant") return role === "admin";
    return true;
  });
  const visibleMobile = [...visibleMain.filter((tab) => tab.href !== "/more").slice(0, 5), visibleMain.find((tab) => tab.href === "/more")!];

  if (loading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4">
        <BrandMark size={56} />
        <Spinner size={22} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="eyebrow !text-danger">{error.includes("business is suspended") ? "Business suspended" : "Connection error"}</p>
        <p className="text-[14px] text-ink-soft max-w-sm">{error}</p>
        {error.includes("business is suspended") ? <form action={logout}><Button variant="primary">Sign out</Button></form> : <Button variant="primary" onClick={() => location.reload()}>Retry</Button>}
      </div>
    );
  }

  const badgeFor = (href: string) => (href === "/inbox" ? waiting : 0);

  return (
    <div className="fixed inset-0 h-dvh flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-[264px] shrink-0 flex-col bg-sidebar text-white">
        <Link href="/today" className="flex items-center gap-3 px-5 h-[84px] border-b border-white/10">
          <BrandMark size={46} />
          <span className="min-w-0">
            <span className="block wordmark text-[15px] leading-none text-white">Cenexa</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.32em] text-brand-cyan mt-1.5">ChatFlow</span>
          </span>
        </Link>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-4 pt-5 space-y-1.5">
          {visibleMain.map((tab) => (
            <SideItem key={tab.href} tab={tab} label={t(tab.labelKey)} active={pathname === "/" ? tab.href === "/today" : pathname.startsWith(tab.href)} badge={badgeFor(tab.href)} />
          ))}
        </nav>

        <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-3">
          <div className="rounded-[12px] bg-white/[0.06] border border-white/10 px-3 py-2.5">
            <p className="text-[12.5px] font-semibold truncate">{business?.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/70">
              <span className={cx("w-1.5 h-1.5 rounded-full", demo ? "bg-amber-400" : "bg-emerald-400")} />
              {demo ? "Demo data" : "WhatsApp live"}
            </p>
          </div>
          {!demo && (
            <form action={logout}>
              <button type="submit" className="w-full flex items-center gap-3 h-12 px-4 rounded-[12px] border border-white/20 text-[12.5px] font-bold uppercase tracking-[0.06em] text-white/90 hover:bg-white/10 transition-colors">
                <Icon name="logout" size={18} />
                Log out
              </button>
            </form>
          )}
        </div>
      </aside>

      {/* Icon rail (tablet) */}
      <nav aria-label="Main" className="hidden md:flex lg:hidden w-[76px] shrink-0 flex-col items-center bg-sidebar py-4 gap-1.5">
        <Link href="/today" className="mb-4" aria-label="Cenexa ChatFlow"><BrandMark size={44} /></Link>
        {visibleMain.map((tab) => (
          <RailItem key={tab.href} tab={tab} label={t(tab.labelKey)} active={pathname === "/" ? tab.href === "/today" : pathname.startsWith(tab.href)} badge={badgeFor(tab.href)} />
        ))}
      </nav>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {demo && (
          <div className="shrink-0 bg-brand-navy text-white text-center h-7 flex items-center justify-center gap-2">
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
          {visibleMobile.map((tab) => {
            const active = pathname === "/" ? tab.href === "/today" : pathname.startsWith(tab.href);
            const badge = badgeFor(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx("relative h-[58px] flex flex-col items-center justify-center gap-1", active ? "text-accent" : "text-ink-faint")}
              >
                {active && <span className="absolute top-0 inset-x-3 h-[3px] bg-brand rounded-b" />}
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

function Count({ n, className, onLight }: { n: number; className?: string; onLight?: boolean }) {
  return (
    <span className={cx("min-w-[20px] h-5 px-1.5 rounded-md text-[10.5px] font-bold flex items-center justify-center tabular", onLight ? "bg-accent text-white" : "bg-attention text-white", className)}>
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
        "flex items-center gap-3.5 h-12 px-4 rounded-[12px] text-[12.5px] uppercase tracking-[0.06em] transition-colors duration-150",
        active ? "bg-white text-brand-navy font-extrabold shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)]" : "text-white/80 font-bold hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon name={tab.icon} size={19} strokeWidth={active ? 2.2 : 1.9} className={active ? "text-accent" : undefined} />
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && <Count n={badge} onLight={active} />}
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
        active ? "bg-white text-accent shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)]" : "text-white/75 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon name={tab.icon} size={20} />
      <span className="sr-only">{label}</span>
      {badge > 0 && <Count n={badge} className="absolute -top-1 -right-1" />}
    </Link>
  );
}
