"use client";
import Link from "next/link";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { Page } from "@/components/cx/Page";
import { Panel, cx } from "@/components/cx/ui";
import { Icon, type IconName } from "@/components/cx/icons";
import { logout } from "@/app/login/actions";
import { isMoneyToConfirm } from "@/lib/inbox";
import { OwnerAlertSettings } from "@/components/cx/OwnerAlertSettings";
import { WhatsAppConnection } from "@/components/cx/WhatsAppConnection";
import { PwaInstallCard } from "@/components/cx/PwaInstallCard";

type Item = { icon: IconName; label: string; hint: string; href?: string; count?: number; state?: "Later" };

export default function MorePage() {
  const { business, conversations, lang, setLang, demo, role } = useDashboard();
  const money = conversations.filter(isMoneyToConfirm).length;

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Operations",
      items: [
        { icon: "rupee", label: "Payments", hint: "Screenshots to verify", href: "/inbox?filter=money", count: money },
        { icon: "template", label: "Templates", hint: "Approved messages for offers and reminders", href: business?.modules_enabled?.templates ? "/templates" : undefined },
        ...(role === "admin" ? [{ icon: "flow" as const, label: "Automations", hint: "Follow-ups, reminders, review requests", href: business?.modules_enabled?.automations ? "/automations" : undefined }] : []),
        ...(role === "admin" || role === "accounts" ? [{ icon: "chart" as const, label: "Reports", hint: "Chats, leads and sales over time", href: business?.modules_enabled?.reports ? "/reports" : undefined }] : []),
        ...(role === "admin" ? [{ icon: "team" as const, label: "Team", hint: "Staff accounts and permissions", href: business?.modules_enabled?.team ? "/team" : undefined }] : []),
      ],
    },
    {
      title: "Account",
      items: [
        { icon: "wifi", label: "WhatsApp connection", hint: "Phone app link, sync and connection status", href: "#whatsapp-connection" },
        { icon: "wallet", label: "Wallet and invoices", hint: "Payment collection and invoices are outside the current release", state: "Later" },
        { icon: "plug", label: "Integrations", hint: "Tracked links and spreadsheet exports", href: "/integrations" },
      ],
    },
  ];

  return (
    <Page wide section="System" title="Settings" subtitle={business?.name}>
      <div className="grid lg:grid-cols-2 gap-5">
        {groups.map((g) => (
          <Panel key={g.title} title={g.title} icon={g.title === "Operations" ? "chart" : "wallet"}>
            <ul className="divide-y divide-line">
              {g.items.map((it) => (
                <li key={it.label}><Row {...it} /></li>
              ))}
            </ul>
          </Panel>
        ))}

        <Panel title="Language" icon="globe">
          <div className="p-4">
            <div className="inline-flex border border-line-strong rounded-[10px] p-0.5" role="radiogroup" aria-label="Language">
              {([
                ["en", "English"],
                ["ta", "தமிழ்"],
              ] as const).map(([code, label]) => (
                <button
                  key={code}
                  role="radio"
                  aria-checked={lang === code}
                  onClick={() => setLang(code)}
                  className={cx("h-9 px-5 rounded-[8px] text-[13px] font-semibold", lang === code ? "bg-brand text-white shadow-brand" : "text-ink-soft hover:text-ink")}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-ink-faint mt-2">Hindi is not available in this release.</p>
          </div>
        </Panel>

        <OwnerAlertSettings demo={demo} />

        <PwaInstallCard />

        <WhatsAppConnection demo={demo} />

        <Panel title="Session" icon="user">
          <ul className="divide-y divide-line">
            <li>
              <Link href="/" className="flex items-center gap-3 px-4 h-12 hover:bg-canvas text-[13px] font-medium">
                <Icon name="history" size={17} className="text-ink-faint" />
                <span className="flex-1">Open home dashboard</span>
                <Icon name="chevron" size={16} className="text-ink-faint" />
              </Link>
            </li>
            {!demo && (
              <li>
                <form action={logout}>
                  <button type="submit" className="w-full flex items-center gap-3 px-4 h-12 hover:bg-danger-tint text-danger text-left text-[13px] font-semibold">
                    <Icon name="logout" size={17} />
                    <span className="flex-1">Sign out</span>
                  </button>
                </form>
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}

function Row({ icon, label, hint, href, count, state }: Item) {
  const inner = (
    <>
      <span className="w-8 h-8 rounded-lg border border-line bg-canvas text-ink-soft flex items-center justify-center shrink-0">
        <Icon name={icon} size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold">{label}</p>
        <p className="text-[12px] text-ink-faint truncate">{hint}</p>
      </div>
      {!!count && <span className="min-w-[20px] h-5 px-1.5 rounded-md bg-attention text-white text-[11px] font-bold flex items-center justify-center tabular">{count}</span>}
      {href ? <Icon name="chevron" size={16} className="text-ink-faint" /> : <span className="eyebrow !text-[9.5px] border border-line rounded px-1.5 py-0.5">{state ?? "Unavailable"}</span>}
    </>
  );
  const cls = "flex items-center gap-3 px-4 py-3";
  return href ? <Link href={href} className={cx(cls, "hover:bg-canvas")}>{inner}</Link> : <div className={cls} aria-disabled="true">{inner}</div>;
}
