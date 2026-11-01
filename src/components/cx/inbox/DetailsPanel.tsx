"use client";
import { useRef, useState } from "react";
import type { ConversationWithLastMessage } from "@/lib/types";
import { useDashboard } from "../DashboardProvider";
import { Avatar, Button, Field, SectionLabel, Status, StatusBox, Tag } from "../ui";
import { aiPausedUntil, formatDayLabel, formatPhone } from "@/lib/inbox";

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
  const { business, patch, sendQR, now } = useDashboard();
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
    if (!ok) onToast("Tag not saved", "error");
  }

  async function removeTag(v: string) {
    const ok = await patch(c.id, { tags: (c.tags ?? []).filter((x) => x !== v) });
    if (!ok) onToast("Tag not removed", "error");
  }

  async function saveNote() {
    setSavingNote(true);
    const ok = await patch(c.id, { internal_note: note });
    setSavingNote(false);
    onToast(ok ? "Note saved" : "Note not saved", ok ? "ok" : "error");
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
  const paused = aiPausedUntil(c, now);

  return (
    <div className="divide-y divide-line">
      <div className="p-4 flex items-center gap-3">
        <Avatar name={c.name} phone={c.phone} size={44} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold truncate">{c.name || "Unknown"}</p>
          <a href={`tel:+${c.phone.replace(/\D/g, "")}`} className="text-[12px] font-mono text-ink-soft hover:text-ink">{formatPhone(c.phone)}</a>
        </div>
      </div>

      <section className="px-4 py-3">
        <SectionLabel>Customer</SectionLabel>
        <dl>
          <Field label="Replies by">{paused ? <Status>AI paused</Status> : c.mode === "agent" ? <Status tone="success">AI</Status> : <Status tone="dark">Team</Status>}</Field>
          <Field label="First contact">{formatDayLabel(c.created_at, now)}</Field>
          <Field label="Messages today"><span className="tabular">{c.msg_count_day ?? 0}</span></Field>
          <Field label="This month"><span className="tabular">{c.msg_count_month ?? 0}</span></Field>
        </dl>
      </section>

      <section className="px-4 py-3">
        <SectionLabel>Payment</SectionLabel>
        {c.payment_status === "pending" ? (
          <div className="rounded-[10px] border border-attention/30 bg-attention-tint p-3">
            <StatusBox tone="attention">Verify screenshot</StatusBox>
            <p className="text-[12.5px] text-ink-soft mt-2">Match it in your bank or UPI app. The customer is messaged either way.</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="danger" size="sm" disabled={paymentBusy} onClick={() => onPayment("rejected")}>Reject</Button>
              <Button variant="primary" size="sm" icon="check" disabled={paymentBusy} onClick={() => onPayment("verified")}>Confirm</Button>
            </div>
          </div>
        ) : (
          <>
            <dl>
              <Field label="Status">
                {c.payment_status === "verified" ? (
                  <Status tone="success">Paid</Status>
                ) : c.payment_status === "rejected" ? (
                  <Status tone="danger">Rejected</Status>
                ) : c.payment_qr_sent ? (
                  <Status tone="info">QR sent · awaiting</Status>
                ) : (
                  <Status>None</Status>
                )}
              </Field>
            </dl>
            <input ref={qrInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && doSendQR(e.target.files[0])} />
            <div className="flex gap-2 mt-2">
              <Button
                variant="primary"
                size="sm"
                icon="qr"
                className="flex-1"
                disabled={sendingQR}
                onClick={() => (business?.qr_image_url ? doSendQR() : qrInput.current?.click())}
              >
                {sendingQR ? "Sending…" : business?.qr_image_url ? "Send payment QR" : "Upload QR"}
              </Button>
              {business?.qr_image_url && (
                <Button size="sm" variant="secondary" onClick={() => qrInput.current?.click()}>Change</Button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="px-4 py-3">
        <SectionLabel>Tags</SectionLabel>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(c.tags ?? []).length === 0 && <p className="text-[12.5px] text-ink-faint">No tags</p>}
          {(c.tags ?? []).map((tg) => (
            <Tag key={tg} onRemove={() => removeTag(tg)}>{tg}</Tag>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); addTag(); }} className="flex gap-2">
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag" className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-line-strong text-[12.5px] placeholder:text-ink-faint focus:outline-none focus:border-ink" aria-label="New tag" />
          <Button type="submit" size="sm" disabled={!tag.trim()}>Add</Button>
        </form>
      </section>

      <section className="px-4 py-3">
        <SectionLabel>Internal note</SectionLabel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Visible to your team only"
          className="w-full px-2.5 py-2 rounded-lg border border-line-strong text-[13px] placeholder:text-ink-faint focus:outline-none focus:border-ink resize-y"
        />
        {noteDirty && (
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="ghost" onClick={() => setNote(c.internal_note ?? "")}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={saveNote} disabled={savingNote}>{savingNote ? "Saving…" : "Save"}</Button>
          </div>
        )}
      </section>
    </div>
  );
}
