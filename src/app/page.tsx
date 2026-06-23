"use client";
 
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import type { ConversationWithLastMessage, Message, Business } from "@/lib/types";
 
const PAYMENT_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  verified: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  none: "",
};
 
const PAYMENT_LABELS: Record<string, string> = {
  pending: "💳 Payment Pending",
  verified: "✅ Payment Verified",
  rejected: "❌ Payment Rejected",
  none: "",
};
 
export default function Dashboard() {
  const router = useRouter();
 
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);
 
  const [business, setBusiness] = useState<Business | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [view, setView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
 
  const selected = conversations.find((c) => c.id === selectedId);
 
  const filteredConvos = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.last_message?.toLowerCase().includes(q)
    );
  }, [conversations, search]);
 
  // ── Auth check on mount ──
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
        return;
      }
      setAuthToken(session.access_token);
    });
 
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
        return;
      }
      setAuthToken(session.access_token);
    });
 
    return () => subscription.unsubscribe();
  }, [supabase, router]);
 
  // ── Fetch current user's business ──
  useEffect(() => {
    if (!authToken) return;
    fetch("/api/me", {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => {
        if (r.status === 404) {
          setAuthLoading(false);
          router.push("/onboard");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data && data.business) {
          setBusiness(data.business);
          setAuthLoading(false);
        }
      })
      .catch(() => setAuthLoading(false));
  }, [authToken, router]);
 
  const fetchConversations = useCallback(async () => {
    if (!business?.id) return;
    const res = await fetch(`/api/conversations?business_id=${business.id}`);
    const data = await res.json();
    setConversations(Array.isArray(data) ? data : []);
  }, [business?.id]);
 
  const fetchMessages = useCallback(async (convoId: string) => {
    const res = await fetch(`/api/conversations/${convoId}/messages`);
    const data = await res.json();
    setMessages(data);
  }, []);
 
  // Only fetch conversations AFTER business is loaded — prevents showing wrong data
  useEffect(() => {
    if (!business?.id) return;
    fetchConversations();
  }, [fetchConversations, business?.id]);
 
  useEffect(() => { if (selectedId) fetchMessages(selectedId); }, [selectedId, fetchMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (showSearch) searchInputRef.current?.focus(); }, [showSearch]);
 
  // ── Realtime ──
  // Realtime — only subscribe after business is loaded
  useEffect(() => {
    if (!supabase || !business?.id) return;
    const channel = supabase
      .channel("realtime-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.conversation_id === selectedId) {
          setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        }
        fetchConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => fetchConversations())
      .subscribe();
    return () => { supabase?.removeChannel(channel); };
  }, [selectedId, fetchConversations, supabase, business?.id]);
 
  async function handleLogout() {
    await supabase?.auth.signOut();
    router.push("/login");
  }
 
  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setConversations((prev) => prev.map((c) => c.id === selected.id ? { ...c, mode: newMode } : c));
  }
 
  async function handleSend() {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    await fetch(`/api/conversations/${selectedId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.trim() }),
    });
    setInput("");
    setSending(false);
    fetchMessages(selectedId);
  }
 
  async function handleVerifyPayment(action: "approve" | "reject") {
    if (!selectedId) return;
    setVerifyingPayment(true);
    await fetch(`/api/conversations/${selectedId}/verify-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setVerifyingPayment(false);
    fetchConversations();
  }
 
  async function addTag() {
    if (!tagInput.trim() || !selected) return;
    const newTags = [...(selected.tags ?? []), tagInput.trim()];
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    setConversations((prev) => prev.map((c) => c.id === selected.id ? { ...c, tags: newTags } : c));
    setTagInput("");
  }
 
  async function removeTag(tag: string) {
    if (!selected) return;
    const newTags = (selected.tags ?? []).filter((t) => t !== tag);
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    setConversations((prev) => prev.map((c) => c.id === selected.id ? { ...c, tags: newTags } : c));
  }
 
  async function saveNote() {
    if (!selected) return;
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internal_note: noteInput }),
    });
    setConversations((prev) => prev.map((c) => c.id === selected.id ? { ...c, internal_note: noteInput } : c));
  }
 
  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatDateSeparator(dateStr: string) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  async function handleDeleteMessage(msgId: string) {
    if (!selectedId) return;
    
    const proceed = window.confirm("Delete Message Options:\n\nUnlike consumer WhatsApp, Meta's Cloud API for businesses does NOT support 'Delete for Everyone' (recalling messages from the customer's phone). \n\nClick OK to 'Delete for Me' (removes from this dashboard).");
    if (!proceed) return;

    setMessages((prev) => prev.filter(m => m.id !== msgId));
    await fetch(`/api/conversations/${selectedId}/messages/${msgId}`, {
      method: "DELETE",
    });
  }

  function getInitials(name: string | null, phone: string) {
    if (name) return name.slice(0, 2).toUpperCase();
    return phone.slice(-2);
  }
 
  function renderMessageContent(msg: Message) {
    if (msg.media_type === "image" && msg.media_url) {
      return (
        <div className="space-y-1">
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.media_url} alt="Image" className="max-w-[220px] rounded-lg border border-white/10 cursor-pointer hover:opacity-90 transition-opacity" />
          </a>
          {msg.is_payment_screenshot && <p className="text-[10px] text-amber-400/80">📎 Payment screenshot</p>}
          {msg.content && msg.content !== "[image]" && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
        </div>
      );
    }
    if (msg.media_type === "audio" && msg.media_url) {
      return (
        <div className="space-y-1">
          <audio controls src={msg.media_url} className="max-w-[220px] h-8" />
          {msg.content && msg.content !== "[audio]" && <p className="text-xs text-white/50">{msg.content}</p>}
        </div>
      );
    }
    if (msg.media_type === "document" && msg.media_url) {
      return (
        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm underline underline-offset-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {msg.content || "Document"}
        </a>
      );
    }
    return <p className="text-sm whitespace-pre-wrap">{msg.content}</p>;
  }
 
  // ── Loading state ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-xs text-white/30">Loading...</p>
        </div>
      </div>
    );
  }
 
  return (
    <div className="flex h-screen bg-[#0f0f0f] font-sans overflow-hidden">
 
      {/* ── SIDEBAR ── */}
      <div className={`
        ${view === "chat" ? "hidden md:flex" : "flex"}
        w-full md:w-[300px] flex-col border-r border-white/[0.06] flex-shrink-0
      `} style={{ background: "#141414" }}>
 
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          {showSearch ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowSearch(false); setSearch(""); }} className="p-1.5 text-white/50 hover:text-white transition-colors flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or number..."
                className="flex-1 bg-white/[0.05] rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/30 border border-white/[0.06] focus:outline-none focus:border-emerald-500/40 h-9"
              />
              {search && (
                <button onClick={() => setSearch("")} className="p-1.5 text-white/40 hover:text-white transition-colors flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xs font-semibold text-white leading-tight truncate max-w-[140px]">{business?.name || "WhatsApp CRM"}</h1>
                  <p className="text-[10px] text-white/40">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowSearch(true)} className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-all" title="Search">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
                <button onClick={handleLogout} className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/[0.05] transition-all" title="Logout">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
 
        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConvos.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-xs text-white/30">{search ? "No results found" : "No conversations yet"}</p>
            </div>
          )}
          {filteredConvos.map((convo) => {
            const isSelected = selectedId === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => {
                  setSelectedId(convo.id);
                  setNoteInput(convo.internal_note ?? "");
                  setView("chat");
                }}
                className={`w-full text-left px-3 py-3.5 transition-all duration-150 relative ${isSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.04] active:bg-white/[0.06]"}`}
                style={{ minHeight: 64 }}
              >
                {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-emerald-500 rounded-r" />}
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center flex-shrink-0 text-white text-[11px] font-semibold">
                    {getInitials(convo.name, convo.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-white/90 truncate">{convo.name || convo.phone}</span>
                      <span className="text-[10px] text-white/30 flex-shrink-0">{formatTime(convo.updated_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <p className="text-xs text-white/40 truncate">
                        {convo.last_message_type === "image" ? "📷 Photo" :
                         convo.last_message_type === "audio" ? "🎤 Voice note" :
                         convo.last_message_type === "document" ? "📄 Document" :
                         convo.last_message || ""}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {convo.payment_status === "pending" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${convo.mode === "agent" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                          {convo.mode === "agent" ? "AI" : "You"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
 
      {/* ── CHAT PANEL ── */}
      <div className={`
        ${view === "list" ? "hidden md:flex" : "flex"}
        flex-1 flex-col min-w-0
      `}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/40">Select a conversation</p>
              <p className="text-xs text-white/20 mt-1">Choose from the list to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0" style={{ background: "#141414" }}>
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Back button — mobile only */}
                <button
                  onClick={() => { setView("list"); setSelectedId(null); }}
                  className="md:hidden p-1.5 -ml-1 rounded-lg text-white/50 hover:text-white transition-colors flex-shrink-0"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                  {getInitials(selected.name, selected.phone)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold text-white leading-tight truncate">{selected.name || selected.phone}</h2>
                  <p className="text-[10px] text-white/40 leading-tight">{selected.phone}</p>
                </div>
                {selected.payment_status !== "none" && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ml-1 hidden sm:inline ${PAYMENT_COLORS[selected.payment_status]}`}>
                    {PAYMENT_LABELS[selected.payment_status]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setShowDetails((v) => !v)} className="hidden md:flex p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-all" title="Toggle details">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </button>
                <button onClick={toggleMode} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${selected.mode === "agent" ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20" : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${selected.mode === "agent" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="hidden sm:inline">{selected.mode === "agent" ? "AI Mode" : "Human Mode"}</span>
                  <span className="sm:hidden">{selected.mode === "agent" ? "AI" : "Human"}</span>
                </button>
              </div>
            </div>
 
            {/* Messages + Details */}
            <div className="flex-1 flex min-h-0">
              {/* Messages */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.map((msg, i) => {
                    const isUser = msg.role === "user";
                    const showTime = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
                    const msgDate = new Date(msg.created_at).toDateString();
                    const prevMsgDate = i > 0 ? new Date(messages[i - 1].created_at).toDateString() : null;
                    const showDateSeparator = msgDate !== prevMsgDate;

                    return (
                      <div key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex justify-center my-5">
                            <span className="px-3 py-1 bg-white/[0.05] border border-white/[0.06] rounded-md text-[10px] uppercase tracking-wider text-white/40 font-semibold shadow-sm">
                              {formatDateSeparator(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isUser ? "justify-start" : "justify-end"} mb-3 group`}>
                          <div className={`flex flex-col ${isUser ? "items-start" : "items-end"} max-w-[80%] md:max-w-[65%] relative`}>
                            {!isUser && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="absolute top-1/2 -translate-y-1/2 -left-8 p-1.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                title="Delete for me"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                            )}
                            {isUser && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="absolute top-1/2 -translate-y-1/2 -right-8 p-1.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                title="Delete for me"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                            )}
                            <div className={`px-3.5 py-2.5 rounded-2xl ${isUser ? "bg-white/[0.07] text-white/90 rounded-tl-sm border border-white/[0.06]" : "bg-emerald-600 text-white rounded-tr-sm"}`}>
                              {renderMessageContent(msg)}
                            </div>
                            {showTime && (
                              <p className="text-[10px] text-white/25 mt-1 px-1">
                                {!isUser && <span className="text-emerald-500/60 mr-1">AI ·</span>}
                                {formatTime(msg.created_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
 
                {/* Input */}
                <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0" style={{ background: "#141414", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
                  <div className="flex items-center gap-2.5 bg-white/[0.06] rounded-xl px-3.5 py-2.5 border border-white/[0.06] focus-within:border-emerald-500/40 transition-colors">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                    />
                    <button onClick={handleSend} disabled={sending || !input.trim()} className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0">
                      {sending ? (
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
 
              {/* ── RIGHT DETAILS PANEL — desktop only ── */}
              {showDetails && (
                <div className="hidden md:flex w-[240px] border-l border-white/[0.06] flex-col overflow-y-auto flex-shrink-0" style={{ background: "#141414" }}>
                  <div className="p-4 space-y-5">
                    <div>
                      <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Customer</p>
                      <p className="text-xs font-medium text-white/80">{selected.name || "Unknown"}</p>
                      <p className="text-[11px] text-white/40 mt-0.5">{selected.phone}</p>
                    </div>
 
                    {selected.payment_status === "pending" && (
                      <div>
                        <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Payment</p>
                        <p className="text-[11px] text-amber-400/80 mb-2">Screenshot received — verify payment</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleVerifyPayment("approve")} disabled={verifyingPayment} className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50">✓ Verify</button>
                          <button onClick={() => handleVerifyPayment("reject")} disabled={verifyingPayment} className="flex-1 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[11px] font-medium border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-50">✗ Reject</button>
                        </div>
                      </div>
                    )}
 
                    {(selected.payment_status === "verified" || selected.payment_status === "rejected") && (
                      <div>
                        <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Payment</p>
                        <span className={`text-[11px] px-2 py-1 rounded-lg border ${PAYMENT_COLORS[selected.payment_status]}`}>{PAYMENT_LABELS[selected.payment_status]}</span>
                      </div>
                    )}
 
                    <div>
                      <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {(selected.tags ?? []).map((tag) => (
                          <span key={tag} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/[0.07] text-white/60 border border-white/10">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="text-white/30 hover:text-white/60 transition-colors">×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Add tag..." className="flex-1 bg-white/[0.05] rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 border border-white/[0.06] focus:outline-none focus:border-white/20" />
                        <button onClick={addTag} className="px-2 rounded-lg bg-white/[0.07] text-white/50 hover:text-white/80 border border-white/[0.06] transition-all text-xs">+</button>
                      </div>
                    </div>
 
                    <div>
                      <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Internal Note</p>
                      <textarea value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Add a private note..." rows={3} className="w-full bg-white/[0.05] rounded-lg px-2.5 py-2 text-[11px] text-white/80 placeholder:text-white/25 border border-white/[0.06] focus:outline-none focus:border-white/20 resize-none" />
                      <button onClick={saveNote} className="mt-1.5 w-full py-1.5 rounded-lg bg-white/[0.07] text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.10] border border-white/[0.06] transition-all">Save Note</button>
                    </div>
 
                    <div>
                      <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Usage</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]"><span className="text-white/30">This hour</span><span className="text-white/50">{selected.msg_count_hour ?? 0} msgs</span></div>
                        <div className="flex justify-between text-[10px]"><span className="text-white/30">Today</span><span className="text-white/50">{selected.msg_count_day ?? 0} msgs</span></div>
                        <div className="flex justify-between text-[10px]"><span className="text-white/30">This month</span><span className="text-white/50">{selected.msg_count_month ?? 0} msgs</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
