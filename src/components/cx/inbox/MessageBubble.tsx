"use client";
import type { Message } from "@/lib/types";
import { formatClock, formatRupees, senderOf, type Sender } from "@/lib/inbox";
import { Badge, Button, SenderBadge, cx } from "../ui";
import { Icon } from "../icons";

const BUBBLE: Record<Sender, string> = {
  customer: "bg-surface border border-line",
  ai: "bg-ai-tint",
  team: "bg-accent-tint",
  phone: "bg-phone-tint",
  history: "bg-sunken",
};

type VoiceInfo = { summary?: string | null; language?: string | null; intent?: string | null };
type PaymentInfo = { amount?: string | null; currency?: string | null; transaction_id?: string | null; payee?: string | null; status?: string | null };
type ImageInfo = { category?: string; description?: string; payment?: PaymentInfo | null; confidence?: "low" | "medium" | "high" };

const LANG_NAMES: Record<string, string> = { ta: "Tamil", en: "English", hi: "Hindi", te: "Telugu", ml: "Malayalam", kn: "Kannada" };

export function MessageBubble({
  msg,
  paymentPending,
  onConfirmPayment,
  onRejectPayment,
  onDelete,
  busy,
}: {
  msg: Message;
  paymentPending: boolean;
  onConfirmPayment: () => void;
  onRejectPayment: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const sender = senderOf(msg);
  const inbound = sender === "customer";
  const analysis = (msg.media_analysis ?? null) as (VoiceInfo & ImageInfo) | null;
  const pending = msg.id.startsWith("temp-");

  return (
    <div className={cx("flex group", inbound ? "justify-start" : "justify-end")}>
      <div className={cx("flex flex-col max-w-[85%] sm:max-w-[70%]", inbound ? "items-start" : "items-end")}>
        <div className={cx("rounded-[14px] px-3.5 py-2.5 text-[16px] leading-relaxed", BUBBLE[sender], inbound ? "rounded-tl-[4px]" : "rounded-tr-[4px]")}>
          <Content msg={msg} analysis={analysis} />
        </div>

        {msg.is_payment_screenshot && (
          <PaymentCard
            payment={analysis?.payment ?? null}
            confidence={analysis?.confidence}
            pending={paymentPending}
            busy={busy}
            onConfirm={onConfirmPayment}
            onReject={onRejectPayment}
          />
        )}

        <div className="flex items-center gap-1.5 mt-1 px-0.5">
          <SenderBadge sender={sender} />
          <span className="text-[12px] text-ink-faint tabular">{pending ? "Sending…" : formatClock(msg.created_at)}</span>
          {!pending && (
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-ink-faint hover:text-danger p-1 rounded transition-opacity"
              aria-label="Remove from dashboard"
              title="Remove from dashboard"
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Content({ msg, analysis }: { msg: Message; analysis: (VoiceInfo & ImageInfo) | null }) {
  const caption = msg.content && !/^\[(image|audio|document|video|sticker)\]$/.test(msg.content) ? msg.content : null;

  if (msg.media_type === "image") {
    return (
      <div className="space-y-2">
        {msg.media_url ? (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.media_url} alt={analysis?.description ?? "Photo"} className="max-w-[240px] max-h-[320px] rounded-[10px] border border-line object-cover" />
          </a>
        ) : (
          <p className="flex items-center gap-2 text-ink-soft"><Icon name="image" size={16} /> Photo</p>
        )}
        {caption && <p className="whitespace-pre-wrap">{caption}</p>}
        {analysis?.description && !msg.is_payment_screenshot && <p className="text-[13px] text-ink-soft">AI sees: {analysis.description}</p>}
      </div>
    );
  }

  if (msg.media_type === "audio") {
    const lang = analysis?.language ? LANG_NAMES[analysis.language] ?? analysis.language : null;
    return (
      <div className="space-y-2 min-w-[220px]">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
          <Icon name="mic" size={15} /> Voice note{lang && <span className="font-normal">· {lang}</span>}
        </p>
        {msg.media_url && <audio controls src={msg.media_url} className="w-full max-w-[260px] h-9" />}
        {msg.transcript ? (
          <p className="whitespace-pre-wrap">&ldquo;{msg.transcript}&rdquo;</p>
        ) : (
          <p className="text-[13px] text-ink-faint">No transcript. Turn on voice understanding in AI settings.</p>
        )}
        {analysis?.summary && (
          <p className="text-[13px] text-ink-soft border-t border-line/70 pt-2">
            <span className="font-semibold text-ink">Summary:</span> {analysis.summary}
          </p>
        )}
      </div>
    );
  }

  if (msg.media_type === "document") {
    return (
      <a href={msg.media_url ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline underline-offset-2">
        <Icon name="file" size={16} /> {caption ?? "Document"}
      </a>
    );
  }

  return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
}

function PaymentCard({
  payment,
  confidence,
  pending,
  busy,
  onConfirm,
  onReject,
}: {
  payment: PaymentInfo | null;
  confidence?: "low" | "medium" | "high";
  pending: boolean;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const amount = payment?.amount ? Number(String(payment.amount).replace(/[^\d.]/g, "")) : NaN;
  return (
    <div className="mt-2 w-[280px] max-w-full bg-surface border border-line rounded-[12px] p-3 text-[14px]">
      <div className="flex items-center justify-between mb-2">
        <p className="font-semibold flex items-center gap-1.5"><Icon name="rupee" size={16} /> Payment screenshot</p>
        {confidence && (
          <Badge tone={confidence === "high" ? "success" : confidence === "medium" ? "attention" : "danger"} className="h-5 text-[11px] px-1.5">
            {confidence} confidence
          </Badge>
        )}
      </div>
      {payment ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-soft">Amount</dt>
          <dd className="font-semibold tabular">{Number.isFinite(amount) ? formatRupees(amount) : payment.amount ?? "Not found"}</dd>
          <dt className="text-ink-soft">Paid to</dt>
          <dd className="truncate">{payment.payee ?? "Not found"}</dd>
          <dt className="text-ink-soft">Reference</dt>
          <dd className="font-mono text-[13px] truncate">{payment.transaction_id ?? "Not found"}</dd>
        </dl>
      ) : (
        <p className="text-ink-soft">Details couldn&apos;t be read. Check the screenshot yourself.</p>
      )}
      <p className="text-[12px] text-ink-faint mt-2">A screenshot is not proof of payment. Check your bank or UPI app before confirming.</p>
      {pending && (
        <div className="flex gap-2 mt-3">
          <Button variant="primary" size="sm" icon="check" className="flex-1" onClick={onConfirm} disabled={busy}>
            Confirm
          </Button>
          <Button variant="danger" size="sm" className="flex-1" onClick={onReject} disabled={busy}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
