"use client";
// Shared data for the ChatFlow 2.0 dashboard: business, conversations,
// messages and the actions on them. Uses the existing API routes, keeps the
// lists live via Supabase Realtime, and swaps in sample data in demo mode.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Business, ConversationWithLastMessage, Message } from "@/lib/types";
import { DEMO_MODE, buildDemo, demoBusiness } from "@/lib/demo-data";
import { translate, type Lang, type StringKey } from "@/lib/i18n";

type Patch = Partial<Pick<ConversationWithLastMessage, "mode" | "assigned_to" | "tags" | "internal_note" | "payment_status" | "ai_paused_until">>;

type Ctx = {
  demo: boolean;
  business: Business | null;
  userId: string | null;
  role: string;
  updateBusiness: (patch: Partial<Business>) => void;
  loading: boolean;
  error: string | null;
  conversations: ConversationWithLastMessage[];
  messages: Record<string, Message[] | undefined>;
  now: number;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: StringKey) => string;
  refresh: () => Promise<void>;
  loadMessages: (id: string) => Promise<void>;
  sendText: (id: string, text: string) => Promise<void>;
  sendImage: (id: string, file: File, caption: string) => Promise<void>;
  sendQR: (id: string, newQrFile?: File) => Promise<void>;
  patch: (id: string, p: Patch) => Promise<boolean>;
  changeMode: (id: string, mode: "agent" | "human") => Promise<boolean>;
  verifyPayment: (id: string, status: "verified" | "rejected", amount?: string) => Promise<{ ok: boolean; message: string }>;
  deleteMessage: (id: string, msgId: string) => Promise<void>;
};

const DashboardContext = createContext<Ctx | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return ctx;
}

function readLang(): Lang {
  try {
    return localStorage.getItem("cx-lang") === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

let tempId = 0;

const noopSubscribe = () => () => {};

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // False during server render and hydration, true after. Nothing data-driven
  // renders before this, so browser-only state (localStorage, demo times) is safe.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const supabase = useMemo(() => (DEMO_MODE ? null : createClient()), []);
  const [demoData] = useState(() => (DEMO_MODE ? buildDemo() : null));
  const [business, setBusiness] = useState<Business | null>(DEMO_MODE ? demoBusiness : null);
  const [userId, setUserId] = useState<string | null>(DEMO_MODE ? "00000000-0000-4000-8000-000000000001" : null);
  const [role, setRole] = useState(DEMO_MODE ? "admin" : "support");
  const [fetching, setFetching] = useState(!DEMO_MODE);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>(demoData?.conversations ?? []);
  const [messages, setMessages] = useState<Record<string, Message[] | undefined>>(demoData?.messages ?? {});
  const [now, setNow] = useState(() => Date.now());
  const [lang, setLangState] = useState<Lang>(readLang);
  const convoIds = useRef(new Set<string>());
  const loading = !mounted || fetching;
  const businessId = business?.id;
  const updateBusiness = useCallback((patch: Partial<Business>) => setBusiness((current) => current ? { ...current, ...patch } : current), []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("cx-lang", l);
    } catch {}
  }, []);
  const t = useCallback((k: StringKey) => translate(lang, k), [lang]);

  // Tick every 30 s so window timers and "AI paused" countdowns stay current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    convoIds.current = new Set(conversations.map((c) => c.id));
  }, [conversations]);

  // ── Load business ──
  useEffect(() => {
    if (DEMO_MODE) return;
    const ctrl = new AbortController();
    fetch("/api/me", { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 401) return router.push("/login");
        if (res.status === 404) return router.push("/onboard");
        if (!res.ok) {
          const problem = await res.json().catch(() => null);
          throw new Error(problem?.error ?? `Could not load your business (${res.status})`);
        }
        const data = await res.json();
        setBusiness(data.business);
        setUserId(data.user?.id ?? null);
        setRole(data.user?.role ?? "support");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message || "Could not load your business");
      })
      .finally(() => setFetching(false));
    return () => ctrl.abort();
  }, [router]);

  const fetchConversations = useCallback(async (): Promise<ConversationWithLastMessage[] | null> => {
    if (DEMO_MODE || !businessId) return null;
    const res = await fetch(`/api/conversations?business_id=${businessId}`);
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? data : null;
  }, [businessId]);

  const refresh = useCallback(async () => {
    const data = await fetchConversations();
    if (data) setConversations(data);
  }, [fetchConversations]);

  // Initial load once the business is known.
  useEffect(() => {
    let live = true;
    fetchConversations()
      .then((data) => {
        if (live && data) setConversations(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [fetchConversations]);

  const loadMessages = useCallback(async (id: string) => {
    if (DEMO_MODE) return;
    const res = await fetch(`/api/conversations/${id}/messages`);
    const data = await res.json().catch(() => []);
    if (Array.isArray(data)) setMessages((m) => ({ ...m, [id]: data }));
  }, []);

  // ── Realtime ──
  useEffect(() => {
    if (!supabase || !businessId) return;
    const channel = supabase
      .channel(`cx-${businessId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (!convoIds.current.has(msg.conversation_id)) return;
        setMessages((m) => {
          const list = m[msg.conversation_id];
          if (!list) return m;
          // Replace an optimistic copy if present, else append.
          const withoutTemp = list.filter((x) => !(x.id.startsWith("temp-") && x.content === msg.content));
          if (withoutTemp.some((x) => x.id === msg.id)) return m;
          return { ...m, [msg.conversation_id]: [...withoutTemp, msg] };
        });
        refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (!convoIds.current.has(msg.conversation_id)) return;
        setMessages((all) => {
          const list = all[msg.conversation_id];
          if (!list) return all;
          return {
            ...all,
            [msg.conversation_id]: list.map((existing) =>
              existing.id === msg.id ? { ...existing, ...msg } : existing
            ),
          };
        });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `business_id=eq.${businessId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, businessId, refresh]);

  // ── Local state helpers ──
  const updateConvo = useCallback((id: string, p: Partial<ConversationWithLastMessage>) => {
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }, []);

  const appendLocal = useCallback(
    (id: string, m: Partial<Message> & Pick<Message, "content">) => {
      const msg: Message = {
        // "temp-" ids show as "Sending…" until the server copy replaces them.
        // Demo mode has no server, so its messages count as sent at once.
        id: `${DEMO_MODE ? "demo" : "temp"}-${++tempId}`,
        conversation_id: id,
        role: "assistant",
        source: "dashboard",
        media_url: null,
        media_type: null,
        is_payment_screenshot: false,
        whatsapp_msg_id: null,
        created_at: new Date().toISOString(),
        ...m,
      };
      setMessages((all) => ({ ...all, [id]: [...(all[id] ?? []), msg] }));
      updateConvo(id, {
        last_message: msg.content,
        last_message_type: msg.media_type,
        last_message_role: "assistant",
        last_message_source: msg.source,
        updated_at: msg.created_at,
      });
      return msg;
    },
    [updateConvo]
  );

  // ── Actions ──
  const sendText = useCallback(
    async (id: string, text: string) => {
      appendLocal(id, { content: text });
      if (DEMO_MODE) return;
      const res = await fetch(`/api/conversations/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error("Message not sent");
      await loadMessages(id);
    },
    [appendLocal, loadMessages]
  );

  const uploadToMedia = useCallback(
    async (file: File, prefix: string) => {
      if (!supabase) return URL.createObjectURL(file);
      const path = `${prefix}-${Date.now()}-${file.name.replace(/\s/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
    },
    [supabase]
  );

  const sendImage = useCallback(
    async (id: string, file: File, caption: string) => {
      const url = await uploadToMedia(file, "qr-codes/img");
      appendLocal(id, { content: caption || "[image]", media_type: "image", media_url: url });
      if (DEMO_MODE) return;
      const res = await fetch(`/api/conversations/${id}/send-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, caption }),
      });
      if (!res.ok) throw new Error("Image not sent");
      await loadMessages(id);
    },
    [appendLocal, loadMessages, uploadToMedia]
  );

  const sendQR = useCallback(
    async (id: string, newQrFile?: File) => {
      let qrUrl = business?.qr_image_url ?? null;
      if (newQrFile) {
        qrUrl = await uploadToMedia(newQrFile, "qr-codes/business-qr");
        setBusiness((b) => (b ? { ...b, qr_image_url: qrUrl } : b));
      }
      if (!qrUrl) throw new Error("Upload your payment QR first");
      appendLocal(id, { content: "[image]", media_type: "image", media_url: qrUrl });
      updateConvo(id, { payment_qr_sent: true });
      if (DEMO_MODE) return;
      const res = await fetch(`/api/conversations/${id}/send-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: qrUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "QR not sent");
      await loadMessages(id);
    },
    [business?.qr_image_url, uploadToMedia, appendLocal, updateConvo, loadMessages]
  );

  const patch = useCallback(
    async (id: string, p: Patch) => {
      const before = conversations.find((c) => c.id === id);
      updateConvo(id, p);
      if (DEMO_MODE) return true;
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok && before) {
        // Roll back the optimistic change.
        const rollback = Object.fromEntries(Object.keys(p).map((k) => [k, before[k as keyof typeof before]]));
        updateConvo(id, rollback);
        return false;
      }
      return true;
    },
    [conversations, updateConvo]
  );

  const changeMode = useCallback(
    async (id: string, mode: "agent" | "human") => {
      if (DEMO_MODE) {
        updateConvo(id, { mode, ...(mode === "agent" ? { ai_paused_until: null } : {}) });
        return true;
      }
      try {
        const response = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "agent" ? { mode, ai_paused_until: null } : { mode }),
        });
        if (!response.ok) return false;
        updateConvo(id, { mode, ...(mode === "agent" ? { ai_paused_until: null } : {}) });
        return true;
      } catch {
        return false;
      }
    },
    [updateConvo]
  );

  const verifyPayment = useCallback(
    async (id: string, status: "verified" | "rejected", amount?: string) => {
      if (DEMO_MODE) {
        updateConvo(id, { payment_status: status, ...(amount ? { payment_amount: Number(amount) } : {}) });
        appendLocal(id, {
          content: status === "verified" ? "Payment received, thank you! Your booking is confirmed." : "We couldn't confirm this payment. Please check and send it again.",
        });
        return { ok: true, message: status === "verified" ? "Payment confirmed. Customer notified." : "Payment rejected. Customer notified." };
      }
      const res = await fetch(`/api/conversations/${id}/verify-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: data.error || `Could not update payment (${res.status})` };
      updateConvo(id, { payment_status: status });
      await loadMessages(id);
      const verb = status === "verified" ? "confirmed" : "rejected";
      if (data.whatsapp_sent) return { ok: true, message: `Payment ${verb}. Customer notified on WhatsApp.` };
      if (data.whatsapp_error) return { ok: true, message: `Payment ${verb}, but the WhatsApp message failed: ${data.whatsapp_error}` };
      return { ok: true, message: `Payment ${verb}.` };
    },
    [updateConvo, appendLocal, loadMessages]
  );

  const deleteMessage = useCallback(async (id: string, msgId: string) => {
    setMessages((all) => ({ ...all, [id]: (all[id] ?? []).filter((m) => m.id !== msgId) }));
    if (DEMO_MODE) return;
    await fetch(`/api/conversations/${id}/messages/${msgId}`, { method: "DELETE" });
  }, []);

  const value: Ctx = {
    demo: DEMO_MODE,
    business,
    userId,
    role,
    updateBusiness,
    loading,
    error,
    conversations,
    messages,
    now,
    lang,
    setLang,
    t,
    refresh,
    loadMessages,
    sendText,
    sendImage,
    sendQR,
    patch,
    changeMode,
    verifyPayment,
    deleteMessage,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
