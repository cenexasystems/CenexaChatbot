"use client";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Badge, Card } from "./ui";

/** Scrollable page with a title, max width suited to reading on desktop. */
export function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-10">
        <header className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-[24px] sm:text-[30px] font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="text-[15px] text-ink-soft mt-1">{subtitle}</p>}
          </div>
          {action}
        </header>
        {children}
      </div>
    </div>
  );
}

/** A feature that isn't built yet: says plainly what it will do. */
export function ComingSoon({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <Card className="p-4 flex gap-3">
      <span className="w-10 h-10 rounded-full bg-sunken text-ink-soft flex items-center justify-center shrink-0">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold">{title}</p>
          <Badge>Coming soon</Badge>
        </div>
        <p className="text-[14px] text-ink-soft mt-1 leading-relaxed">{body}</p>
      </div>
    </Card>
  );
}
