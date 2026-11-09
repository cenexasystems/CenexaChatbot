"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  return (
    <div key={pathname} className="h-full flex flex-col">
      <header className="shrink-0 bg-surface border-b border-line">
        <div className={cx("mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 min-h-[76px]", wide ? "max-w-6xl" : "max-w-5xl")}>
          {/* Title block with a brand bar on the left, as in the NAAYAN panels. */}
          <div className="min-w-0 flex items-stretch gap-3">
            <span className="w-[4px] rounded-full bg-brand shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              {section && <p className="eyebrow !text-accent mb-0.5">{section}</p>}
              <h1 className="heading text-[20px] sm:text-[23px] leading-tight truncate">{title}</h1>
              {subtitle && <p className="text-[12.5px] font-medium text-ink-soft mt-0.5 truncate">{subtitle}</p>}
            </div>
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
