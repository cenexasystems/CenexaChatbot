"use client";
import type { Message } from "@/lib/types";
import { formatClock, formatRupees, senderOf, type Sender } from "@/lib/inbox";
import { Button, Field, SenderLabel, StatusBox, cx } from "../ui";
import { Icon } from "../icons";

const BUBBLE: Record<Sender, string> = {
  customer: "bg-surface border border-line text-ink",
  ai: "bg-sunken border border-line text-ink",
  team: "bg-brand text-white",
  phone: "bg-phone-tint border border-[#D6DEE9] text-ink",
  history: "bg-sunken text-ink-soft",
};

type VoiceInfo = { summary?: string | null; language?: string | null; intent?: string | null };
type PaymentInfo = { amount?: string | null; currency?: string | null; transaction_id?: string | null; payee?: string | null; status?: string | null; date?: string | null };
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
      <div className={cx("flex flex-col max-w-[85%] sm:max-w-[68%]", inbound ? "items-start" : "items-end")}>
        <div className={cx("flex items-center gap-2 mb-1 px-0.5", inbound ? "flex-row" : "flex-row-reverse")}>
          <SenderLabel sender={sender} />
          <span className="text-[10.5px] text-ink-faint tabular">{pending ? "Sending…" : formatClock(msg.created_at)}</span>
          {!pending && !inbound && msg.delivery_status && (
            <span
              className={cx(
                "inline-flex items-center gap-1 text-[10px]",
                msg.delivery_status === "failed" ? "text-danger" : msg.delivery_status === "read" ? "text-accent" : "text-ink-faint"
              )}
              title={msg.delivery_status === "failed" && msg.delivery_error_code
                ? `Failed (Meta error ${msg.delivery_error_code})`
                : msg.delivery_status[0].toUpperCase() + msg.delivery_status.slice(1)}
              aria-label={msg.delivery_status === "failed" ? "Message failed to send" : `Message ${msg.delivery_status}`}
            >
              {msg.delivery_status === "failed" ? (
                <><Icon name="alert" size={12} /><span>Failed</span></>
              ) : (
                <Icon name={msg.delivery_status === "sent" ? "check" : "checks"} size={13} />
              )}
            </span>
          )}
          {!pending && (
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-ink-faint hover:text-danger transition-opacity"
              aria-label="Remove from dashboard"
              title="Remove from dashboard"
            >
              <Icon name="trash" size={12} />
            </button>
          )}
        </div>
        <div className={cx("rounded-[12px] px-3 py-2 text-[14px] leading-relaxed", BUBBLE[sender], inbound ? "rounded-tl-[3px]" : "rounded-tr-[3px]", pending && "opacity-60")}>
          <Content msg={msg} analysis={analysis} dark={sender === "team"} />
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
      </div>
    </div>
  );
}

function Content({ msg, analysis, dark }: { msg: Message; analysis: (VoiceInfo & ImageInfo) | null; dark: boolean }) {
  const caption = msg.content && !/^\[(image|audio|document|video|sticker)\]$/.test(msg.content) ? msg.content : null;
  const subtle = dark ? "text-white/60" : "text-ink-faint";

  if (msg.media_type === "image") {
    return (
      <div className="space-y-1.5">
        {msg.media_url ? (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="block -mx-1 -mt-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.media_url} alt={analysis?.description ?? "Photo"} className="max-w-[220px] max-h-[300px] rounded-[8px] object-cover" />
          </a>
        ) : (
          <p className={cx("flex items-center gap-2", subtle)}><Icon name="image" size={14} /> Photo</p>
        )}
        {caption && <p className="whitespace-pre-wrap">{caption}</p>}
        {analysis?.description && !msg.is_payment_screenshot && <p className={cx("text-[12px]", subtle)}>AI: {analysis.description}</p>}
      </div>
    );
  }

  if (msg.media_type === "audio") {
    const lang = analysis?.language ? LANG_NAMES[analysis.language] ?? analysis.language : null;
    return (
      <div className="space-y-2 min-w-[230px]">
        <p className={cx("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]", subtle)}>
          <Icon name="mic" size={12} /> Voice note{lang && ` · ${lang}`}
        </p>
        {msg.media_url && <audio controls src={msg.media_url} className="w-full max-w-[260px] h-8" />}
        {msg.transcript ? (
          <p className="whitespace-pre-wrap">{msg.transcript}</p>
        ) : (
          <p className={cx("text-[12px]", subtle)}>No transcript available.</p>
        )}
        {analysis?.summary && (
          <div className={cx("border-t pt-2", dark ? "border-white/15" : "border-line")}>
            <p className={cx("text-[10px] font-bold uppercase tracking-[0.1em] mb-0.5", subtle)}>Summary</p>
            <p className="text-[13px]">{analysis.summary}</p>
          </div>
        )}
      </div>
    );
  }

  if (msg.media_type === "document") {
    return (
      <a href={msg.media_url ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline underline-offset-2">
        <Icon name="file" size={15} /> {caption ?? "Document"}
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
    <div className="mt-2 w-[300px] max-w-full bg-surface border border-line-strong rounded-[12px] overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center justify-between px-3 h-9 border-b border-line bg-canvas">
        <span className="eyebrow !text-ink !text-[9.5px] flex items-center gap-1.5"><Icon name="rupee" size={12} /> Payment · read by AI</span>
        {confidence && (
          <StatusBox tone={confidence === "high" ? "success" : confidence === "medium" ? "attention" : "danger"}>{confidence}</StatusBox>
        )}
      </div>
      <div className="px-3 py-1">
        {payment ? (
          <dl>
            <Field label="Amount"><span className="tabular text-[15px] font-semibold">{Number.isFinite(amount) ? formatRupees(amount) : payment.amount ?? "—"}</span></Field>
            <Field label="Paid to">{payment.payee ?? "—"}</Field>
            <Field label="Reference"><span className="font-mono text-[12px]">{payment.transaction_id ?? "—"}</span></Field>
            {payment.date && <Field label="Date">{payment.date}</Field>}
          </dl>
        ) : (
          <p className="text-[12.5px] text-ink-soft py-2">Details could not be read. Check the screenshot.</p>
        )}
      </div>
      <p className="px-3 pb-2.5 text-[11px] text-ink-faint leading-snug flex gap-1.5">
        <Icon name="alert" size={12} className="shrink-0 mt-0.5" />
        A screenshot is not proof. Match it in your bank or UPI app first.
      </p>
      {pending && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <Button variant="danger" size="sm" onClick={onReject} disabled={busy}>Reject</Button>
          <Button variant="primary" size="sm" icon="check" onClick={onConfirm} disabled={busy}>Confirm</Button>
        </div>
      )}
    </div>
  );
}
