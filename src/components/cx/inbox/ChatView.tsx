"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "../DashboardProvider";
import { Avatar, Button, EmptyState, IconButton, Sheet, Spinner, WindowTimer, cx } from "../ui";
import { Icon } from "../icons";
import { MessageBubble } from "./MessageBubble";
import { DetailsPanel } from "./DetailsPanel";
import { aiPausedUntil, formatDayLabel, formatDuration, formatPhone, windowLeftMs } from "@/lib/inbox";

type Toast = { msg: string; tone: "ok" | "error" } | null;

export function ChatView({ id }: { id: string }) {
  const { conversations, messages, loadMessages, now, patch, resumeAI, sendText, sendImage, verifyPayment, deleteMessage, business } = useDashboard();
  const params = useSearchParams();
  const backHref = params.get("filter") ? `/inbox?filter=${params.get("filter")}` : "/inbox";
  const c = conversations.find((x) => x.id === id);
  const list = messages[id];

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!list) loadMessages(id);
  }, [id, list, loadMessages]);

  // Keep the chat pinned to the newest message, including when images finish
  // loading, unless the user has scrolled up to read older messages.
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  useEffect(() => {
    stickRef.current = true;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [list?.length, id]);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) endRef.current?.scrollIntoView({ block: "end" });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [list]);

  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(tm);
  }, [toast]);

  const showToast = useCallback((msg: string, tone: "ok" | "error" = "ok") => setToast({ msg, tone }), []);

  // Auto-grow the composer.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  if (!c) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas">
        {conversations.length === 0 ? <Spinner /> : <EmptyState icon="inbox" title="Chat not found" body="It may have been removed." action={<Link href="/inbox" className="text-accent font-medium">Back to inbox</Link>} />}
      </div>
    );
  }

  const paused = aiPausedUntil(c, now);
  const windowLeft = windowLeftMs(c.last_inbound_at, now);
  const windowKnown = c.last_inbound_at !== undefined;

  async function handleSend() {
    if (sending) return;
    const body = text.trim();
    if (!image && !body) return;
    setSending(true);
    try {
      if (image) {
        await sendImage(id, image.file, body);
        URL.revokeObjectURL(image.preview);
        setImage(null);
      } else {
        await sendText(id, body);
      }
      setText("");
    } catch (e) {
      showToast((e as Error).message || "Not sent. Check your connection and try again.", "error");
    } finally {
      setSending(false);
    }
  }

  async function handlePayment(status: "verified" | "rejected") {
    if (status === "rejected" && !window.confirm("Reject this payment? The customer will be told to check and send it again.")) return;
    setPaymentBusy(true);
    const r = await verifyPayment(id, status);
    setPaymentBusy(false);
    showToast(r.message, r.ok ? "ok" : "error");
  }

  async function handleDelete(msgId: string) {
    if (!window.confirm("Remove this message from the dashboard?\n\nWhatsApp doesn't let businesses unsend messages, so the customer will still see it.")) return;
    await deleteMessage(id, msgId);
  }

  async function setMode(mode: "agent" | "human") {
    const ok = mode === "agent" ? (await resumeAI(id), true) : await patch(id, { mode });
    if (ok === false) showToast("Could not change who replies. Try again.", "error");
  }

  // Keyed by chat so the note draft resets when you open another chat.
  const details = <DetailsPanel key={c.id} convo={c} onToast={showToast} onPayment={handlePayment} paymentBusy={paymentBusy} />;

  return (
    <div className="h-full flex min-w-0">
      <div className="flex-1 min-w-0 flex flex-col bg-canvas">
        {/* Header */}
        <header className="shrink-0 h-16 px-2 sm:px-4 flex items-center gap-2 border-b border-line bg-surface">
          <Link href={backHref} className="md:hidden w-11 h-11 flex items-center justify-center text-ink-soft -ml-1" aria-label="Back to inbox">
            <Icon name="back" size={22} />
          </Link>
          <button onClick={() => setDetailsOpen(true)} className="flex items-center gap-3 min-w-0 flex-1 text-left xl:pointer-events-none">
            <span className="hidden sm:inline-flex"><Avatar name={c.name} phone={c.phone} size={40} /></span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{c.name || formatPhone(c.phone)}</p>
              <p className="text-[13px] text-ink-soft truncate tabular">{c.name ? formatPhone(c.phone) : "Tap for details"}</p>
            </div>
          </button>
          <ModeSwitch mode={paused ? "human" : c.mode} onChange={setMode} />
          <IconButton icon="panel" label="Customer details" onClick={() => setDetailsOpen(true)} className="xl:hidden" />
        </header>

        {/* Who is replying */}
        {paused ? (
          <Banner tone="neutral" icon="phone">
            <span className="flex-1">
              You replied from your phone. <strong>AI is paused for {formatDuration(paused.getTime() - now)}.</strong>
            </span>
            <Button size="sm" variant="secondary" icon="play" onClick={() => resumeAI(id)}>Resume now</Button>
          </Banner>
        ) : c.mode === "human" ? (
          <Banner tone="accent" icon="user">
            <span className="flex-1">AI is off for this chat. You&apos;re replying.</span>
            <Button size="sm" variant="secondary" icon="bot" onClick={() => setMode("agent")}>Let AI reply</Button>
          </Banner>
        ) : null}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 overflow-y-auto px-3 sm:px-6 py-4"
        >
          {!list ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon="inbox" title="No messages yet" body="Messages in this chat will appear here." />
          ) : (
            <div ref={contentRef} className="space-y-3 max-w-3xl mx-auto">
              {list.map((m, i) => {
                const day = new Date(m.created_at).toDateString();
                const showDay = i === 0 || new Date(list[i - 1].created_at).toDateString() !== day;
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="flex justify-center my-4">
                        <span className="px-3 h-7 inline-flex items-center rounded-full bg-sunken text-[12px] font-medium text-ink-soft">{formatDayLabel(m.created_at, now)}</span>
                      </div>
                    )}
                    <MessageBubble
                      msg={m}
                      paymentPending={c.payment_status === "pending"}
                      busy={paymentBusy}
                      onConfirmPayment={() => handlePayment("verified")}
                      onRejectPayment={() => handlePayment("rejected")}
                      onDelete={() => handleDelete(m.id)}
                    />
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-line bg-surface px-2 sm:px-4 pt-2" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
            {windowKnown && <WindowTimer msLeft={windowLeft} />}
            {windowKnown && windowLeft === null && (
              <span className="text-[12px] text-ink-faint">A normal reply may not be delivered. Templates are coming soon.</span>
            )}
          </div>
          {image && (
            <div className="flex items-center gap-3 mb-2 p-2 rounded-[10px] bg-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.preview} alt="" className="w-12 h-12 rounded-[8px] object-cover" />
              <p className="flex-1 min-w-0 text-[14px] truncate">{image.file.name}</p>
              <IconButton icon="close" label="Remove photo" onClick={() => { URL.revokeObjectURL(image.preview); setImage(null); }} />
            </div>
          )}
          <div className="flex items-end gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImage({ file: f, preview: URL.createObjectURL(f) });
                e.target.value = "";
              }}
            />
            <IconButton icon="image" label="Send a photo" onClick={() => fileRef.current?.click()} />
            <textarea
              ref={textRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={image ? "Add a caption (optional)" : `Reply as ${business?.name ?? "your business"}`}
              className="flex-1 min-h-11 max-h-[140px] px-3.5 py-2.5 rounded-[10px] bg-sunken text-[16px] leading-snug placeholder:text-ink-faint resize-none focus:outline-none focus:ring-2 focus:ring-accent/30"
              aria-label="Message"
            />
            <button
              onClick={handleSend}
              disabled={sending || (!text.trim() && !image)}
              className="w-11 h-11 rounded-[10px] bg-accent text-white flex items-center justify-center shrink-0 hover:bg-accent-hover disabled:opacity-40 transition-colors"
              aria-label="Send"
            >
              {sending ? <Spinner size={16} /> : <Icon name="send" size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Side card on wide screens, sheet elsewhere */}
      <aside className="hidden xl:block w-[340px] shrink-0 border-l border-line bg-surface overflow-y-auto">{details}</aside>
      <div className="xl:hidden">
        <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Customer details">
          {details}
        </Sheet>
      </div>

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-[60] max-w-[90vw] px-4 py-3 rounded-[12px] shadow-lg text-[14px]",
            toast.tone === "ok" ? "bg-ink text-white" : "bg-danger text-white"
          )}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: "agent" | "human"; onChange: (m: "agent" | "human") => void }) {
  return (
    <div className="flex shrink-0 bg-sunken rounded-[10px] p-0.5" role="radiogroup" aria-label="Who replies">
      {(["agent", "human"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => mode !== m && onChange(m)}
          className={cx(
            "h-9 px-2.5 sm:px-3 rounded-[8px] text-[13px] font-medium flex items-center gap-1.5 transition-colors",
            mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          )}
        >
          <Icon name={m === "agent" ? "bot" : "user"} size={15} />
          <span className="hidden sm:inline">{m === "agent" ? "AI replies" : "You reply"}</span>
          <span className="sm:hidden">{m === "agent" ? "AI" : "You"}</span>
        </button>
      ))}
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: "neutral" | "accent"; icon: "phone" | "user"; children: React.ReactNode }) {
  return (
    <div className={cx("shrink-0 flex items-center gap-3 px-4 py-2 text-[14px] border-b border-line", tone === "accent" ? "bg-accent-tint" : "bg-phone-tint")}>
      <Icon name={icon} size={18} className="shrink-0 text-ink-soft" />
      {children}
    </div>
  );
}
