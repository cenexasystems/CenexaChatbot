"use client";
// UI kit for ChatFlow 2.0. Monochrome, dense, colour only for status.
// Tokens live in globals.css (@theme).
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./icons";
import type { Sender } from "@/lib/inbox";
import { formatDuration, initials } from "@/lib/inbox";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ── Buttons ──────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-brand hover:brightness-110",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-tint hover:border-danger/40",
};

export function Button({
  variant = "secondary",
  icon,
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; size?: "sm" | "md" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap",
        size === "md" ? "h-10 px-4 text-[13px]" : "h-8 px-3 text-[12px]",
        VARIANTS[variant],
        className
      )}
    >
      {icon && <Icon name={icon} size={size === "md" ? 16 : 14} />}
      {children}
    </button>
  );
}

/** A link that looks like a Button. */
export function ButtonLink({ href, variant = "secondary", icon, children, className }: { href: string; variant?: Variant; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[10px] text-[13px] font-semibold transition-colors duration-150 whitespace-nowrap",
        VARIANTS[variant],
        className
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  className,
  bordered,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; bordered?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center w-10 h-10 rounded-[10px] text-ink-soft hover:bg-sunken hover:text-ink transition-colors duration-150 shrink-0",
        bordered && "border border-line-strong bg-surface",
        className
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

// ── Status, tags, sender labels ──────────────────────────────────────────

export type Tone = "neutral" | "attention" | "success" | "danger" | "info" | "dark";

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-faint",
  attention: "bg-attention",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-info",
  dark: "bg-accent",
};
const TEXT: Record<Tone, string> = {
  neutral: "text-ink-soft",
  attention: "text-attention",
  success: "text-success",
  danger: "text-danger",
  info: "text-info",
  dark: "text-accent",
};

/** Dot + small uppercase label. The standard way to show a state. */
export function Status({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] whitespace-nowrap", TEXT[tone], className)}>
      <span className={cx("w-1.5 h-1.5 rounded-full shrink-0", DOT[tone])} />
      {children}
    </span>
  );
}

/** Boxed status for headers and cards where it needs more weight. */
export function StatusBox({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  const bg: Record<Tone, string> = {
    neutral: "bg-sunken border-line",
    attention: "bg-attention-tint border-attention/25",
    success: "bg-success-tint border-success/25",
    danger: "bg-danger-tint border-danger/25",
    info: "bg-info-tint border-info/25",
    dark: "bg-brand border-transparent text-white",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-[10.5px] font-bold uppercase tracking-[0.08em] whitespace-nowrap", bg[tone], tone !== "dark" && TEXT[tone])}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** Neutral tag, e.g. customer labels. */
export function Tag({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 pl-2 pr-2 rounded-md border border-line bg-surface text-[11.5px] font-medium text-ink-soft whitespace-nowrap">
      {children}
      {onRemove && (
        <button onClick={onRemove} className="-mr-1 w-5 h-5 rounded hover:bg-sunken flex items-center justify-center" aria-label={`Remove ${children}`}>
          <Icon name="close" size={11} />
        </button>
      )}
    </span>
  );
}

const SENDER_LABEL: Record<Sender, string> = {
  customer: "Customer",
  ai: "AI",
  team: "Team",
  phone: "Phone app",
  history: "Imported",
};
const SENDER_ICON: Record<Sender, IconName> = { customer: "user", ai: "bot", team: "user", phone: "phone", history: "history" };

export function SenderLabel({ sender }: { sender: Sender }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
      <Icon name={SENDER_ICON[sender]} size={11} />
      {SENDER_LABEL[sender]}
    </span>
  );
}

/** Time left in Meta's free 24-hour reply window. */
export function WindowTimer({ msLeft, long }: { msLeft: number | null; long?: boolean }) {
  if (msLeft === null) return <Status tone="neutral">{long ? "Reply window closed · template only" : "Window closed"}</Status>;
  const urgent = msLeft < 2 * 60 * 60 * 1000;
  return (
    <Status tone={urgent ? "attention" : "neutral"}>
      {formatDuration(msLeft)} {long ? "left in free reply window" : "left"}
    </Status>
  );
}

// ── Layout pieces ────────────────────────────────────────────────────────

export function Avatar({ name, phone, size = 36 }: { name: string | null; phone: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-sunken text-ink font-semibold shrink-0 border border-line"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.33) }}
      aria-hidden="true"
    >
      {initials(name, phone)}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("bg-surface border border-line rounded-[16px] shadow-[0_1px_3px_rgba(10,31,68,0.06)]", className)}>{children}</div>;
}

/** Card with a header bar: uppercase title on the left, actions on the right. */
export function Panel({ title, icon, meta, action, children, className }: { title: string; icon?: IconName; meta?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <Icon name={icon} size={18} className="text-accent shrink-0" />}
          <h2 className="heading text-[15.5px] truncate">{title}</h2>
          {meta}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx("eyebrow mb-2", className)}>{children}</h3>;
}

/** Number tile for overview screens. The whole tile opens the list behind it. */
export function StatTile({ label, value, sub, href, tone = "neutral", icon }: { label: string; value: ReactNode; sub?: string; href: string; tone?: Tone; icon: IconName }) {
  const hot = tone === "attention" || tone === "danger";
  return (
    <Link
      href={href}
      className={cx(
        "group block rounded-[14px] border p-4 transition-colors duration-150",
        hot ? "bg-brand border-transparent text-white shadow-brand hover:brightness-110" : "bg-surface border-line hover:border-line-strong"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cx("eyebrow", hot && "!text-white/70")}>{label}</span>
        <Icon name={icon} size={16} className={hot ? "text-white/70" : "text-ink-faint"} />
      </div>
      <p className="text-[30px] font-semibold leading-none tabular mt-3">{value}</p>
      <div className={cx("hidden sm:flex items-center justify-between mt-3 text-[12px]", hot ? "text-white/70" : "text-ink-faint")}>
        <span className="truncate">{sub}</span>
        <Icon name="chevron" size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

/** Underlined tabs with counts, for filtering a list. */
export function FilterTabs<T extends string>({ items, active, hrefFor, label }: { items: { id: T; label: string; count?: number }[]; active: T; hrefFor: (id: T) => string; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-5 overflow-x-auto px-4 border-b border-line [scrollbar-width:none]">
      {items.map((it) => {
        const on = it.id === active;
        return (
          <Link
            key={it.id}
            href={hrefFor(it.id)}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cx(
              "relative h-10 inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap transition-colors",
              on ? "text-accent font-bold" : "text-ink-faint font-medium hover:text-ink"
            )}
          >
            {it.label}
            {it.count !== undefined && it.count > 0 && (
              <span className={cx("tabular text-[10.5px] font-bold min-w-[18px] h-[18px] px-1 rounded-md inline-flex items-center justify-center", on ? "bg-accent text-white" : "bg-sunken text-ink-soft")}>
                {it.count}
              </span>
            )}
            {on && <span className="absolute left-0 right-0 -bottom-px h-[3px] bg-brand rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Small toggle pill used for tag filters. */
export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap border transition-colors",
        active ? "bg-accent text-white border-accent" : "bg-surface text-ink-soft border-line-strong hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/** Empty state: short, says what happens next, offers the one action. */
export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12 max-w-xs mx-auto">
      <span className="w-11 h-11 rounded-[12px] bg-brand text-white shadow-brand flex items-center justify-center mb-3">
        <Icon name={icon} size={18} />
      </span>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      <p className="text-[13px] text-ink-faint mt-1 leading-relaxed">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Bottom sheet on phones, right-side panel on larger screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-brand-navy/40" aria-label="Close" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-h-[88vh] sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[380px] sm:max-h-none bg-surface rounded-t-[20px] sm:rounded-none shadow-[0_30px_70px_-15px_rgba(0,0,0,0.45)] flex flex-col">
        <div className="flex items-center justify-between pl-4 pr-2 h-12 border-b border-line shrink-0">
          <p className="eyebrow !text-ink">{title}</p>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-line border-t-accent animate-spin"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Key/value row for property panels. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-line last:border-0">
      <dt className="text-[12.5px] text-ink-faint shrink-0">{label}</dt>
      <dd className="text-[13px] text-ink font-medium text-right min-w-0 break-words">{children}</dd>
    </div>
  );
}
