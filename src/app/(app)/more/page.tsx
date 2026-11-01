"use client";
import Link from "next/link";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { Page } from "@/components/cx/Page";
import { Badge, Card, cx } from "@/components/cx/ui";
import { Icon, type IconName } from "@/components/cx/icons";
import { logout } from "@/app/login/actions";
import { isMoneyToConfirm } from "@/lib/inbox";

type Item = { icon: IconName; label: string; hint: string; href?: string; soon?: boolean; count?: number };

export default function MorePage() {
  const { business, conversations, lang, setLang, demo } = useDashboard();
  const money = conversations.filter(isMoneyToConfirm).length;

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Run the business",
      items: [
        { icon: "rupee", label: "Payments", hint: "Screenshots to check and confirm", href: "/inbox?filter=money", count: money },
        { icon: "template", label: "Templates", hint: "Approved messages for offers and reminders", soon: true },
        { icon: "flow", label: "Automations", hint: "Follow-ups, reminders and review requests", soon: true },
        { icon: "chart", label: "Reports", hint: "Chats, leads and sales over time", soon: true },
        { icon: "team", label: "Team", hint: "Invite staff and choose what they can do", soon: true },
      ],
    },
    {
      title: "Account",
      items: [
        { icon: "wifi", label: "WhatsApp connection", hint: "Phone app link, quality rating and sending limit", soon: true },
        { icon: "wallet", label: "Wallet and invoices", hint: "Message costs and GST invoices", soon: true },
        { icon: "plug", label: "Integrations", hint: "Connect your website, Shopify or sheets", soon: true },
      ],
    },
  ];

  return (
    <Page title="More" subtitle={business?.name}>
      {groups.map((g) => (
        <section key={g.title} className="mb-6">
          <h2 className="text-[13px] font-semibold text-ink-soft mb-2 px-1">{g.title}</h2>
          <Card className="overflow-hidden">
            <ul>
              {g.items.map((it) => (
                <li key={it.label} className="border-b border-line last:border-0">
                  <Row {...it} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}

      <section className="mb-6">
        <h2 className="text-[13px] font-semibold text-ink-soft mb-2 px-1">Settings</h2>
        <Card className="p-4">
          <p className="font-medium flex items-center gap-2"><Icon name="globe" size={18} /> Language / மொழி</p>
          <div className="flex gap-2 mt-3" role="radiogroup" aria-label="Language">
            {([
              ["en", "English"],
              ["ta", "தமிழ்"],
            ] as const).map(([code, label]) => (
              <button
                key={code}
                role="radio"
                aria-checked={lang === code}
                onClick={() => setLang(code)}
                className={cx("flex-1 h-11 rounded-[10px] border font-medium", lang === code ? "bg-accent text-white border-accent" : "bg-surface border-line text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-ink-faint mt-2">Hindi is coming next. Some screens are still in English only.</p>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <ul>
          <li className="border-b border-line">
            <Link href="/" className="flex items-center gap-3 px-4 min-h-14 hover:bg-canvas">
              <Icon name="history" size={20} className="text-ink-soft" />
              <span className="flex-1">Open the old dashboard</span>
              <Icon name="chevron" size={18} className="text-ink-faint" />
            </Link>
          </li>
          {!demo && (
            <li>
              <form action={logout}>
                <button type="submit" className="w-full flex items-center gap-3 px-4 min-h-14 hover:bg-danger-tint text-danger text-left">
                  <Icon name="logout" size={20} />
                  <span className="flex-1">Log out</span>
                </button>
              </form>
            </li>
          )}
        </ul>
      </Card>
    </Page>
  );
}

function Row({ icon, label, hint, href, soon, count }: Item) {
  const inner = (
    <>
      <span className="w-10 h-10 rounded-full bg-sunken text-ink-soft flex items-center justify-center shrink-0">
        <Icon name={icon} size={19} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-[13px] text-ink-soft truncate">{hint}</p>
      </div>
      {soon && <Badge>Soon</Badge>}
      {!!count && <Badge tone="attention">{count}</Badge>}
      {href && <Icon name="chevron" size={18} className="text-ink-faint" />}
    </>
  );
  const cls = "flex items-center gap-3 px-4 py-3";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-canvas`}>{inner}</Link>
  ) : (
    <div className={cx(cls, "opacity-80")} aria-disabled="true">{inner}</div>
  );
}
