"use client";
// Small UI kit for ChatFlow 2.0. Tokens live in globals.css (@theme).
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./icons";
import type { Sender } from "@/lib/inbox";
import { formatDuration, initials } from "@/lib/inbox";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-line hover:bg-sunken",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-danger border border-line hover:bg-danger-tint",
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
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none select-none",
        size === "md" ? "min-h-11 px-4 text-[15px]" : "min-h-9 px-3 text-[13px]",
        VARIANTS[variant],
        className
      )}
    >
      {icon && <Icon name={icon} size={size === "md" ? 18 : 16} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center w-11 h-11 rounded-[10px] text-ink-soft hover:bg-sunken hover:text-ink transition-colors duration-150 shrink-0",
        className
      )}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

export function Chip({
  active,
  count,
  children,
  onClick,
  href,
}: {
  active?: boolean;
  count?: number;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const cls = cx(
    "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap border transition-colors duration-150",
    active ? "bg-accent text-white border-accent" : "bg-surface text-ink-soft border-line hover:text-ink hover:bg-sunken"
  );
  const inner = (
    <>
      {children}
      {count !== undefined && count > 0 && (
        <span className={cx("tabular text-[12px] rounded-full px-1.5 min-w-5 text-center", active ? "bg-white/20" : "bg-sunken text-ink")}>
          {count}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} scroll={false} aria-current={active ? "true" : undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
      {inner}
    </button>
  );
}

type Tone = "neutral" | "accent" | "attention" | "success" | "danger" | "info" | "ai" | "phone";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-soft",
  accent: "bg-accent-tint text-accent",
  attention: "bg-attention-tint text-attention",
  success: "bg-success-tint text-success",
  danger: "bg-danger-tint text-danger",
  info: "bg-info-tint text-info",
  ai: "bg-ai-tint text-[#6B5320]",
  phone: "bg-phone-tint text-[#46505A]",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium whitespace-nowrap", TONES[tone], className)}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

const SENDER_META: Record<Sender, { label: string; tone: Tone; icon: IconName }> = {
  customer: { label: "Customer", tone: "neutral", icon: "user" },
  ai: { label: "AI", tone: "ai", icon: "bot" },
  team: { label: "Team", tone: "accent", icon: "user" },
  phone: { label: "Phone", tone: "phone", icon: "phone" },
  history: { label: "Earlier", tone: "neutral", icon: "history" },
};

/** Text badge naming who sent a message. Colour is never the only signal. */
export function SenderBadge({ sender, name }: { sender: Sender; name?: string }) {
  const m = SENDER_META[sender];
  return (
    <Badge tone={m.tone} icon={m.icon} className="h-5 text-[11px] px-1.5">
      {sender === "team" && name ? name : m.label}
    </Badge>
  );
}

/** Pill showing time left in the 24-hour reply window. */
export function WindowTimer({ msLeft, compact }: { msLeft: number | null; compact?: boolean }) {
  if (msLeft === null) {
    return (
      <Badge tone="neutral" icon="clock" className={compact ? "h-5 text-[11px] px-1.5" : undefined}>
        {compact ? "Closed" : "Window closed · template only"}
      </Badge>
    );
  }
  const urgent = msLeft < 2 * 60 * 60 * 1000;
  return (
    <Badge tone={urgent ? "attention" : "neutral"} icon="clock" className={compact ? "h-5 text-[11px] px-1.5" : undefined}>
      {formatDuration(msLeft)}
      {!compact && " left to reply free"}
    </Badge>
  );
}

export function Avatar({ name, phone, size = 40 }: { name: string | null; phone: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-sunken text-ink-soft font-semibold shrink-0 border border-line"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {initials(name, phone)}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("bg-surface border border-line rounded-[12px]", className)}>{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-[13px] font-semibold text-ink-soft mb-2">{children}</h3>;
}

/** Empty state: says what to do and offers the one-tap action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12 max-w-sm mx-auto">
      <span className="w-12 h-12 rounded-full bg-accent-tint text-accent flex items-center justify-center mb-4">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      <p className="text-[15px] text-ink-soft mt-1.5 leading-relaxed">{body}</p>
      {action && <div className="mt-5">{action}</div>}
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
      <button className="absolute inset-0 bg-ink/30" aria-label="Close" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 max-h-[85vh] sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[360px] sm:max-h-none bg-surface rounded-t-[16px] sm:rounded-none shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 border-b border-line shrink-0">
          <p className="text-[17px] font-semibold">{title}</p>
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
