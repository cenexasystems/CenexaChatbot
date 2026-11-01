"use client";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

/** Page with a fixed header bar (section label, title, actions) and scrolling body. */
export function Page({
  section,
  title,
  subtitle,
  action,
  children,
  wide,
}: {
  section?: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 bg-surface border-b border-line">
        <div className={cx("mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 min-h-16", wide ? "max-w-6xl" : "max-w-5xl")}>
          <div className="min-w-0">
            {section && <p className="eyebrow mb-0.5">{section}</p>}
            <h1 className="text-[18px] sm:text-[20px] font-semibold leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-[12.5px] text-ink-faint mt-0.5 truncate">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className={cx("mx-auto px-4 sm:px-6 py-5 pb-10", wide ? "max-w-6xl" : "max-w-5xl")}>{children}</div>
      </div>
    </div>
  );
}

/** Roadmap rows: features not built yet, stated plainly. */
export function Roadmap({ items }: { items: { icon: IconName; title: string; body: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => (
        <li key={it.title} className="flex items-start gap-3 px-4 py-3.5">
          <span className="w-8 h-8 rounded-lg border border-line bg-canvas text-ink-soft flex items-center justify-center shrink-0 mt-0.5">
            <Icon name={it.icon} size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold">{it.title}</p>
            <p className="text-[12.5px] text-ink-faint mt-0.5 leading-relaxed">{it.body}</p>
          </div>
          <span className="eyebrow !text-[9.5px] mt-1.5 shrink-0 border border-line rounded px-1.5 py-0.5">Planned</span>
        </li>
      ))}
    </ul>
  );
}
