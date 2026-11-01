"use client";
import { useRef, useState } from "react";
import type { ConversationWithLastMessage } from "@/lib/types";
import { useDashboard } from "../DashboardProvider";
import { Avatar, Badge, Button, SectionLabel } from "../ui";
import { Icon } from "../icons";
import { formatPhone, formatDayLabel } from "@/lib/inbox";

export function DetailsPanel({
  convo: c,
  onToast,
  onPayment,
  paymentBusy,
}: {
  convo: ConversationWithLastMessage;
  onToast: (msg: string, tone?: "ok" | "error") => void;
  onPayment: (status: "verified" | "rejected") => void;
  paymentBusy: boolean;
}) {
  const { business, patch, sendQR } = useDashboard();
  const [tag, setTag] = useState("");
  const [note, setNote] = useState(c.internal_note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [sendingQR, setSendingQR] = useState(false);
  const qrInput = useRef<HTMLInputElement>(null);

  async function addTag() {
    const v = tag.trim();
    if (!v || c.tags?.includes(v)) return setTag("");
    setTag("");
    const ok = await patch(c.id, { tags: [...(c.tags ?? []), v] });
    if (!ok) onToast("Tag not saved. Try again.", "error");
  }

  async function removeTag(v: string) {
    const ok = await patch(c.id, { tags: (c.tags ?? []).filter((x) => x !== v) });
    if (!ok) onToast("Tag not removed. Try again.", "error");
  }

  async function saveNote() {
    setSavingNote(true);
    const ok = await patch(c.id, { internal_note: note });
    setSavingNote(false);
    onToast(ok ? "Note saved" : "Note not saved. Try again.", ok ? "ok" : "error");
  }

  async function doSendQR(file?: File) {
    setSendingQR(true);
    try {
      await sendQR(c.id, file);
      onToast("Payment QR sent");
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setSendingQR(false);
      if (qrInput.current) qrInput.current.value = "";
    }
  }

  const noteDirty = note !== (c.internal_note ?? "");

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Avatar name={c.name} phone={c.phone} size={52} />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold truncate">{c.name || "Unknown name"}</p>
          <a href={`tel:+${c.phone.replace(/\D/g, "")}`} className="text-[14px] text-accent tabular">{formatPhone(c.phone)}</a>
          <p className="text-[13px] text-ink-faint">First message {formatDayLabel(c.created_at).toLowerCase()}</p>
        </div>
      </div>

      {/* Payment */}
      <section>
        <SectionLabel>Payment</SectionLabel>
        {c.payment_status === "pending" && (
          <div className="bg-attention-tint rounded-[12px] p-3">
            <p className="font-semibold text-attention">Screenshot received</p>
            <p className="text-[14px] text-ink-soft mt-0.5">Check your bank or UPI app, then confirm. The customer gets a WhatsApp message either way.</p>
            <div className="flex gap-2 mt-3">
              <Button variant="primary" size="sm" icon="check" className="flex-1" disabled={paymentBusy} onClick={() => onPayment("verified")}>Confirm</Button>
              <Button variant="danger" size="sm" className="flex-1" disabled={paymentBusy} onClick={() => onPayment("rejected")}>Reject</Button>
            </div>
          </div>
        )}
        {c.payment_status === "verified" && <Badge tone="success" icon="check">Payment confirmed</Badge>}
        {c.payment_status === "rejected" && <Badge tone="danger" icon="close">Payment rejected</Badge>}
        {c.payment_status !== "pending" && (
          <div className="mt-3 space-y-2">
            <input ref={qrInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && doSendQR(e.target.files[0])} />
            <Button
              variant={c.payment_status === "none" ? "primary" : "secondary"}
              icon="qr"
              className="w-full"
              disabled={sendingQR}
              onClick={() => (business?.qr_image_url ? doSendQR() : qrInput.current?.click())}
            >
              {sendingQR ? "Sending…" : business?.qr_image_url ? "Send payment QR" : "Upload and send payment QR"}
            </Button>
            {c.payment_qr_sent && c.payment_status === "none" && (
              <p className="text-[13px] text-info flex items-center gap-1.5"><Icon name="clock" size={14} /> QR sent. Waiting for their screenshot.</p>
            )}
            {business?.qr_image_url && (
              <button onClick={() => qrInput.current?.click()} className="text-[13px] text-ink-soft underline underline-offset-2 hover:text-ink">
                Use a different QR image
              </button>
            )}
          </div>
        )}
      </section>

      {/* Tags */}
      <section>
        <SectionLabel>Tags</SectionLabel>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(c.tags ?? []).length === 0 && <p className="text-[14px] text-ink-faint">No tags yet. Tags help you find chats later.</p>}
          {(c.tags ?? []).map((tg) => (
            <span key={tg} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full bg-sunken text-[13px]">
              {tg}
              <button onClick={() => removeTag(tg)} className="w-6 h-6 rounded-full hover:bg-line flex items-center justify-center text-ink-soft" aria-label={`Remove tag ${tg}`}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); addTag(); }} className="flex gap-2">
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag, e.g. Bridal" className="flex-1 min-w-0 h-11 px-3 rounded-[10px] bg-sunken text-[15px] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30" aria-label="New tag" />
          <Button type="submit" icon="plus" disabled={!tag.trim()}>Add</Button>
        </form>
      </section>

      {/* Note */}
      <section>
        <SectionLabel>Private note</SectionLabel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Only your team sees this"
          className="w-full px-3 py-2.5 rounded-[10px] bg-sunken text-[15px] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 resize-y"
        />
        {noteDirty && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="ghost" onClick={() => setNote(c.internal_note ?? "")}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={saveNote} disabled={savingNote}>{savingNote ? "Saving…" : "Save note"}</Button>
          </div>
        )}
      </section>

      {/* Activity */}
      <section>
        <SectionLabel>Messages</SectionLabel>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["This hour", c.msg_count_hour],
            ["Today", c.msg_count_day],
            ["This month", c.msg_count_month],
          ].map(([label, n]) => (
            <div key={label as string} className="bg-sunken rounded-[10px] py-2">
              <dd className="text-[17px] font-semibold tabular">{(n as number) ?? 0}</dd>
              <dt className="text-[12px] text-ink-soft">{label}</dt>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
