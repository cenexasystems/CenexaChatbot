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
import { templateVariableCount } from "@/lib/templates";

type Toast = { msg: string; tone: "ok" | "error" } | null;

export function ChatView({ id }: { id: string }) {
  const { conversations, messages, messagePages, loadMessages, loadOlderMessages, retryTranscription, now, changeMode, sendText, sendImage, verifyPayment, deleteMessage, business, demo, role } = useDashboard();
  const canReply = !business?.strict_roles || ["admin", "support", "sales"].includes(role);
  const canVerifyPayment = !business?.strict_roles || ["admin", "accounts"].includes(role);
  const params = useSearchParams();
  const backHref = params.get("filter") ? `/inbox?filter=${params.get("filter")}` : "/inbox";
  const c = conversations.find((x) => x.id === id);
  const list = messages[id];

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [chatTemplates, setChatTemplates] = useState<Array<{ id: string; name: string; language: string; body: string }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateValues, setTemplateValues] = useState<string[]>([]);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null);

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
  }, [id]);
  useEffect(() => {
    const area = scrollAreaRef.current;
    const previous = preserveScrollRef.current;
    if (area && previous) {
      requestAnimationFrame(() => {
        area.scrollTop = area.scrollHeight - previous.height + previous.top;
        preserveScrollRef.current = null;
      });
    } else if (stickRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [list?.length]);
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
  const selectedTemplate = chatTemplates.find((template) => template.id === selectedTemplateId);

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

  async function handleLoadOlder() {
    const area = scrollAreaRef.current;
    if (!area || loadingOlder) return;
    preserveScrollRef.current = { height: area.scrollHeight, top: area.scrollTop };
    setLoadingOlder(true);
    try { await loadOlderMessages(id); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not load older messages", "error"); }
    finally { setLoadingOlder(false); }
  }

  async function openTemplatePicker() {
    setTemplatePickerOpen(true);
    if (business?.modules_enabled?.templates !== true) return;
    if (demo) {
      const sample = { id: "demo-template", name: "appointment_reminder", language: "en", body: "Hi {{1}}, your appointment is on {{2}}." };
      setChatTemplates([sample]);
      setSelectedTemplateId(sample.id);
      setTemplateValues(["", ""]);
      return;
    }
    try {
      const response = await fetch("/api/templates");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not load templates");
      const approved = (result.templates ?? []).filter((template: { status: string }) => template.status === "approved");
      setChatTemplates(approved);
      setSelectedTemplateId(approved[0]?.id ?? "");
      setTemplateValues(Array.from({ length: templateVariableCount(approved[0]?.body ?? "") }, () => ""));
    } catch (e) { showToast((e as Error).message, "error"); }
  }

  async function handleSendTemplate() {
    if (!selectedTemplate || templateBusy) return;
    if (demo) { showToast("Demo mode: nothing was sent."); return; }
    setTemplateBusy(true);
    try {
      const response = await fetch(`/api/conversations/${id}/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplate.id, bodyParameters: templateValues }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Template not sent");
      await loadMessages(id);
      setTemplatePickerOpen(false);
      showToast("Template sent.");
    } catch (e) { showToast((e as Error).message, "error"); }
    finally { setTemplateBusy(false); }
  }

  async function handlePayment(status: "verified" | "rejected") {
    if (status === "rejected" && !window.confirm("Reject this payment? The customer will be asked to check and resend.")) return;
    const amount = status === "verified" ? window.prompt("Payment amount (optional)", "")?.trim() || undefined : undefined;
    setPaymentBusy(true);
    const r = await verifyPayment(id, status, amount);
    setPaymentBusy(false);
    showToast(r.message, r.ok ? "ok" : "error");
  }

  async function handleDelete(msgId: string) {
    if (!window.confirm("Remove this message from the dashboard?\n\nWhatsApp doesn't let businesses unsend messages. The customer will still see it.")) return;
    await deleteMessage(id, msgId);
  }

  async function handleRetryTranscription(msgId: string) {
    if (transcribingId) return;
    setTranscribingId(msgId);
    try {
      await retryTranscription(id, msgId);
      showToast("Voice note transcribed.");
    } catch (e) {
      showToast((e as Error).message || "Could not transcribe voice note.", "error");
    } finally {
      setTranscribingId(null);
    }
  }

  async function setMode(mode: "agent" | "human") {
    if (modeBusy) return;
    setModeBusy(true);
    const ok = await changeMode(id, mode);
    setModeBusy(false);
    if (!ok) showToast("Could not save this reply mode. Please try again.", "error");
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
          <ModeSwitch mode={paused ? "human" : c.mode} onChange={setMode} disabled={modeBusy || !canReply} />
          <IconButton icon="panel" label="Customer details" onClick={() => setDetailsOpen(true)} className="xl:hidden" />
        </header>

        {/* Who is replying */}
        {paused ? (
          <Bar label="AI paused" icon="phone">
            <span className="flex-1 min-w-0">You replied from the phone app. AI resumes in <strong className="tabular">{formatDuration(paused.getTime() - now)}</strong>.</span>
            {canReply && <Button size="sm" variant="secondary" icon="play" onClick={() => setMode("agent")} disabled={modeBusy}>Resume</Button>}
          </Bar>
        ) : c.mode === "human" ? (
          <Bar label="Manual" icon="user">
            <span className="flex-1 min-w-0">AI is off for this chat.</span>
            {canReply && <Button size="sm" variant="secondary" icon="bot" onClick={() => setMode("agent")}>Hand to AI</Button>}
          </Bar>
        ) : null}

        {/* Messages */}
        <div
          ref={scrollAreaRef}
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
              {messagePages[id]?.hasMore && <div className="text-center"><button type="button" onClick={() => void handleLoadOlder()} disabled={loadingOlder} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink-soft disabled:opacity-50">{loadingOlder ? "Loading older messages…" : "Load older messages"}</button></div>}
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
                      onRetryTranscription={!demo && canReply && m.media_type === "audio" && !m.transcript ? () => void handleRetryTranscription(m.id) : undefined}
                      transcribing={transcribingId === m.id}
                      canDelete={canReply}
                      canVerifyPayment={canVerifyPayment}
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
              {canReply && windowLeft === null && business?.modules_enabled?.templates === true && <button onClick={templatePickerOpen ? () => setTemplatePickerOpen(false) : openTemplatePicker} className="text-[11px] font-semibold text-accent hover:underline">{templatePickerOpen ? "Close templates" : "Send a template"}</button>}
            </div>
          )}
          {templatePickerOpen ? (
            <div className="mb-3 rounded-xl border border-line bg-canvas p-3 space-y-3">
              <label className="block text-[12px] font-semibold">Approved template
                <select className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px]" value={selectedTemplateId} onChange={(e) => { const nextId = e.target.value; const nextTemplate = chatTemplates.find((template) => template.id === nextId); setSelectedTemplateId(nextId); setTemplateValues(Array.from({ length: templateVariableCount(nextTemplate?.body ?? "") }, () => "")); }}>
                  {chatTemplates.length === 0 && <option value="">No approved templates found</option>}
                  {chatTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}
                </select>
              </label>
              {selectedTemplate && <>
                <p className="text-[12px] text-ink-soft">{selectedTemplate.body}</p>
                {templateValues.map((value, index) => <label key={`${selectedTemplate.id}-${index}`} className="block text-[12px]">Value for {`{{${index + 1}}}`}<input className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px]" value={value} onChange={(e) => setTemplateValues((current) => current.map((item, i) => i === index ? e.target.value : item))} /></label>)}
              </>}
              <div className="flex justify-end"><Button variant="primary" onClick={handleSendTemplate} disabled={!canReply || templateBusy || !selectedTemplate || templateValues.some((value) => !value.trim())}>{templateBusy ? "Sending…" : "Send template"}</Button></div>
            </div>
          ) : null}
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
                if (!canReply) return;
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={image ? "Caption (optional)" : `Reply as ${business?.name ?? "business"}…`}
              readOnly={!canReply}
              className="flex-1 min-h-10 max-h-[140px] px-3 py-2 rounded-[10px] border border-line-strong bg-surface text-[14px] leading-snug placeholder:text-ink-faint resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              aria-label="Message"
            />
            <button
              onClick={handleSend}
              disabled={!canReply || sending || (!text.trim() && !image)}
              className="h-10 px-4 rounded-[10px] bg-brand shadow-brand text-white flex items-center gap-2 shrink-0 text-[12px] font-bold uppercase tracking-[0.08em] hover:brightness-110 disabled:opacity-30 transition-colors"
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
            toast.tone === "ok" ? "bg-brand-navy text-white" : "bg-danger text-white"
          )}
        >
          <Icon name={toast.tone === "ok" ? "check" : "alert"} size={16} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ModeSwitch({ mode, onChange, disabled }: { mode: "agent" | "human"; onChange: (m: "agent" | "human") => void; disabled: boolean }) {
  return (
    <div className="flex shrink-0 border border-line-strong rounded-[10px] p-0.5 bg-surface" role="radiogroup" aria-label="Who replies" aria-busy={disabled}>
      {(["agent", "human"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => mode !== m && !disabled && onChange(m)}
          disabled={disabled}
          className={cx(
            "h-9 px-2.5 sm:px-3 rounded-[8px] text-[12px] font-extrabold uppercase tracking-[0.07em] flex items-center gap-1.5 transition-colors disabled:opacity-60",
            mode === m ? "bg-brand text-white shadow-brand" : "text-ink-faint hover:text-ink"
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
      <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-brand-navy text-white text-[10px] font-bold uppercase tracking-[0.1em] shrink-0">
        <Icon name={icon} size={12} />
        {label}
      </span>
      {children}
    </div>
  );
}
