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
        {conversations.length === 0 ? <Spinner /> : <EmptyState icon="inbox" title="Chat not found" body="It may have been removed." action={<Link href="/inbox" className="text-[13px] font-semibold underline">Back to inbox</Link>} />}
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
      showToast((e as Error).message || "Not sent. Check your connection.", "error");
    } finally {
      setSending(false);
    }
  }

  async function handlePayment(status: "verified" | "rejected") {
    if (status === "rejected" && !window.confirm("Reject this payment? The customer will be asked to check and resend.")) return;
    setPaymentBusy(true);
    const r = await verifyPayment(id, status);
    setPaymentBusy(false);
    showToast(r.message, r.ok ? "ok" : "error");
  }

  async function handleDelete(msgId: string) {
    if (!window.confirm("Remove this message from the dashboard?\n\nWhatsApp doesn't let businesses unsend messages. The customer will still see it.")) return;
    await deleteMessage(id, msgId);
  }

  async function setMode(mode: "agent" | "human") {
    const ok = mode === "agent" ? (await resumeAI(id), true) : await patch(id, { mode });
    if (ok === false) showToast("Could not switch. Try again.", "error");
  }

  // Keyed by chat so the note draft resets when you open another chat.
  const details = <DetailsPanel key={c.id} convo={c} onToast={showToast} onPayment={handlePayment} paymentBusy={paymentBusy} />;

  return (
    <div className="h-full flex min-w-0">
      <div className="flex-1 min-w-0 flex flex-col bg-canvas">
        {/* Header */}
        <header className="shrink-0 h-16 px-2 sm:px-4 flex items-center gap-2 border-b border-line bg-surface">
          <Link href={backHref} className="md:hidden w-10 h-10 flex items-center justify-center text-ink -ml-1" aria-label="Back to inbox">
            <Icon name="back" size={22} />
          </Link>
          <button onClick={() => setDetailsOpen(true)} className="flex items-center gap-3 min-w-0 flex-1 text-left xl:pointer-events-none">
            <span className="hidden sm:inline-flex"><Avatar name={c.name} phone={c.phone} size={36} /></span>
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold truncate leading-tight">{c.name || formatPhone(c.phone)}</p>
              <p className="text-[11.5px] text-ink-faint font-mono truncate mt-0.5">{formatPhone(c.phone)}</p>
            </div>
          </button>
          <ModeSwitch mode={paused ? "human" : c.mode} onChange={setMode} />
          <IconButton icon="panel" label="Customer details" onClick={() => setDetailsOpen(true)} className="xl:hidden" />
        </header>

        {/* Who is replying */}
        {paused ? (
          <Bar label="AI paused" icon="phone">
            <span className="flex-1 min-w-0">You replied from the phone app. AI resumes in <strong className="tabular">{formatDuration(paused.getTime() - now)}</strong>.</span>
            <Button size="sm" variant="secondary" icon="play" onClick={() => resumeAI(id)}>Resume</Button>
          </Bar>
        ) : c.mode === "human" ? (
          <Bar label="Manual" icon="user">
            <span className="flex-1 min-w-0">AI is off for this chat.</span>
            <Button size="sm" variant="secondary" icon="bot" onClick={() => setMode("agent")}>Hand to AI</Button>
          </Bar>
        ) : null}

        {/* Messages */}
        <div
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 overflow-y-auto px-3 sm:px-6 py-4"
        >
          {!list ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon="inbox" title="No messages" body="Messages in this chat will appear here." />
          ) : (
            <div ref={contentRef} className="space-y-4 max-w-3xl mx-auto">
              {list.map((m, i) => {
                const day = new Date(m.created_at).toDateString();
                const showDay = i === 0 || new Date(list[i - 1].created_at).toDateString() !== day;
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="flex items-center gap-3 my-4">
                        <span className="flex-1 h-px bg-line" />
                        <span className="eyebrow !text-[9.5px]">{formatDayLabel(m.created_at, now)}</span>
                        <span className="flex-1 h-px bg-line" />
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
        <div className="shrink-0 border-t border-line bg-surface px-3 sm:px-4 pt-2.5" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
          {windowKnown && (
            <div className="flex items-center justify-between gap-2 mb-2">
              <WindowTimer msLeft={windowLeft} long />
              {windowLeft === null && <span className="text-[11px] text-ink-faint hidden sm:inline">Templates coming soon</span>}
            </div>
          )}
          {image && (
            <div className="flex items-center gap-3 mb-2 p-2 rounded-[10px] border border-line bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.preview} alt="" className="w-10 h-10 rounded-md object-cover" />
              <p className="flex-1 min-w-0 text-[12.5px] truncate">{image.file.name}</p>
              <IconButton icon="close" label="Remove photo" onClick={() => { URL.revokeObjectURL(image.preview); setImage(null); }} />
            </div>
          )}
          <div className="flex items-end gap-2">
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
            <IconButton icon="image" label="Attach photo" bordered onClick={() => fileRef.current?.click()} />
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
              placeholder={image ? "Caption (optional)" : `Reply as ${business?.name ?? "business"}…`}
              className="flex-1 min-h-10 max-h-[140px] px-3 py-2 rounded-[10px] border border-line-strong bg-surface text-[14px] leading-snug placeholder:text-ink-faint resize-none focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              aria-label="Message"
            />
            <button
              onClick={handleSend}
              disabled={sending || (!text.trim() && !image)}
              className="h-10 px-4 rounded-[10px] bg-ink text-white flex items-center gap-2 shrink-0 text-[12px] font-bold uppercase tracking-[0.08em] hover:bg-accent-hover disabled:opacity-30 transition-colors"
              aria-label="Send"
            >
              {sending ? <Spinner size={14} /> : <Icon name="send" size={15} />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <p className="hidden sm:block text-[10.5px] text-ink-faint mt-1.5">Enter to send · Shift + Enter for a new line</p>
        </div>
      </div>

      {/* Side card on wide screens, sheet elsewhere */}
      <aside className="hidden xl:block w-[320px] shrink-0 border-l border-line bg-surface overflow-y-auto">{details}</aside>
      <div className="xl:hidden">
        <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Customer details">
          {details}
        </Sheet>
      </div>

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-[60] max-w-[90vw] pl-3 pr-4 h-11 rounded-[12px] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.45)] text-[13px] font-medium flex items-center gap-2",
            toast.tone === "ok" ? "bg-ink text-white" : "bg-danger text-white"
          )}
        >
          <Icon name={toast.tone === "ok" ? "check" : "alert"} size={16} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: "agent" | "human"; onChange: (m: "agent" | "human") => void }) {
  return (
    <div className="flex shrink-0 border border-line-strong rounded-[10px] p-0.5 bg-surface" role="radiogroup" aria-label="Who replies">
      {(["agent", "human"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => mode !== m && onChange(m)}
          className={cx(
            "h-8 px-2.5 sm:px-3 rounded-[8px] text-[11px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-colors",
            mode === m ? "bg-ink text-white" : "text-ink-faint hover:text-ink"
          )}
        >
          <Icon name={m === "agent" ? "bot" : "user"} size={14} />
          {m === "agent" ? "AI" : "Team"}
        </button>
      ))}
    </div>
  );
}

function Bar({ label, icon, children }: { label: string; icon: "phone" | "user"; children: React.ReactNode }) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 text-[12.5px] text-ink-soft border-b border-line bg-surface">
      <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-ink text-white text-[10px] font-bold uppercase tracking-[0.1em] shrink-0">
        <Icon name={icon} size={12} />
        {label}
      </span>
      {children}
    </div>
  );
}
