"use client";
 
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
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
    return createClient();
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Persist theme in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("dash-theme") as "dark" | "light" | null;
    if (saved) setTheme(saved);
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("dash-theme", next);
  }
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteEditMode, setNoteEditMode] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [view, setView] = useState<"list" | "chat">("list");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sendingImage, setSendingImage] = useState(false);
  const [sendingQR, setSendingQR] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
 
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
      .then((r) => r.json())
      .then((data) => {
        if (data.business) {
          setBusiness(data.business);
        }
        setAuthLoading(false);
      })
      .catch(() => setAuthLoading(false));
  }, [authToken]);
 
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

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function cancelImagePreview() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSendImage() {
    if (!imageFile || !selectedId || sendingImage) return;
    setSendingImage(true);
    try {
      // Upload to Supabase Storage bucket "media"
      const fileName = `qr-codes/${Date.now()}-${imageFile.name.replace(/\s/g, "_")}`;
      const { error: uploadError } = await supabase!
        .storage
        .from("media")
        .upload(fileName, imageFile, { contentType: imageFile.type, upsert: false });

      if (uploadError) {
        console.error("Upload failed:", uploadError.message);
        alert("Upload failed: " + uploadError.message);
        setSendingImage(false);
        return;
      }

      // Get the public URL
      const { data: urlData } = supabase!
        .storage
        .from("media")
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // Send image via WhatsApp API
      await fetch(`/api/conversations/${selectedId}/send-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl, caption: input.trim() }),
      });

      // Clear state
      cancelImagePreview();
      setInput("");
      fetchMessages(selectedId);
    } catch (err) {
      console.error("Send image error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setSendingImage(false);
    }
  }
 
  async function handleSendQR(uploadedUrl?: string) {
    if (!selectedId || sendingQR) return;
    const qrUrl = uploadedUrl || business?.qr_image_url;
    if (!qrUrl) {
      // No QR stored yet — open file picker to upload first
      qrFileInputRef.current?.click();
      return;
    }
    setSendingQR(true);
    const res = await fetch(`/api/conversations/${selectedId}/send-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: qrUrl }),
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    setSendingQR(false);
    fetchMessages(selectedId);
  }

  async function handleQRFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setSendingQR(true);
    try {
      const fileName = `qr-codes/business-qr-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase!
        .storage
        .from("media")
        .upload(fileName, file, { contentType: file.type, upsert: true });
      if (uploadError) { alert("Upload failed: " + uploadError.message); return; }
      const { data: urlData } = supabase!.storage.from("media").getPublicUrl(fileName);
      await handleSendQR(urlData.publicUrl);
      // Update business in local state so button works instantly next time
      if (business) setBusiness({ ...business, qr_image_url: urlData.publicUrl });
    } finally {
      if (qrFileInputRef.current) qrFileInputRef.current.value = "";
      setSendingQR(false);
    }
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
    if (!selected || savingNote) return;
    setSavingNote(true);
    setNoteSaved(false);
    const res = await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ internal_note: noteInput }),
    });
    setSavingNote(false);
    if (res.ok) {
      setConversations((prev) => prev.map((c) => c.id === selected.id ? { ...c, internal_note: noteInput } : c));
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }
  }
 
  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    <div className={`flex h-screen font-sans overflow-hidden dash-bg ${theme === "light" ? "dashboard-light" : ""}`}>
 
      {/* ── SIDEBAR ── */}
      <div className={`
        ${view === "chat" ? "hidden md:flex" : "flex"}
        w-full md:w-[300px] flex-col border-r dash-border flex-shrink-0 dash-sidebar
      `}>
 
        {/* Header */}
        <div className="px-4 py-3 border-b dash-border">
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
                  <h1 className="text-xs font-semibold dash-text-primary leading-tight truncate max-w-[140px]">{business?.name || "WhatsApp CRM"}</h1>
                  <p className="text-[10px] text-white/40">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Theme toggle */}
                <button onClick={toggleTheme} className="p-2 rounded-lg dash-text-secondary hover:bg-white/[0.05] transition-all" title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}>
                  {theme === "dark" ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                </button>
                <button onClick={() => setShowSearch(true)} className="p-2 rounded-lg dash-text-secondary hover:bg-white/[0.05] transition-all" title="Search">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>

                <button onClick={handleLogout} className="w-[44px] h-[44px] rounded hover:bg-white/5 flex items-center justify-center text-white/40 hover:text-red-400 transition-all" title="Logout">
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium text-white/90 truncate">{convo.name || convo.phone}</span>
                        {convo.payment_status && convo.payment_status !== "none" && (
                          <span className={`text-[8px] px-1 py-0.2 rounded font-bold flex-shrink-0 border uppercase tracking-wider ${
                            convo.payment_status === "verified" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            convo.payment_status === "pending" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                            "bg-red-500/20 text-red-400 border-red-500/30"
                          }`}>
                            {convo.payment_status}
                          </span>
                        )}
                      </div>
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
            <div className="px-4 py-3 border-b dash-border flex items-center justify-between flex-shrink-0 dash-sidebar">
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
                  <h2 className="text-xs font-semibold dash-text-primary leading-tight truncate">{selected.name || selected.phone}</h2>
                  <p className="text-[10px] dash-text-secondary leading-tight">{selected.phone}</p>
                </div>
                {selected.payment_status !== "none" && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ml-1 hidden sm:inline ${PAYMENT_COLORS[selected.payment_status]}`}>
                    {PAYMENT_LABELS[selected.payment_status]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setShowDetails((v) => !v)} className="flex p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-all" title="Toggle details">
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
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 dash-bg">
                  {messages.map((msg, i) => {
                    const isUser = msg.role === "user";
                    const showTime = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
                    return (
                      <div key={msg.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                        <div className={`flex flex-col ${isUser ? "items-start" : "items-end"} max-w-[80%] md:max-w-[65%]`}>
                          <div className={`px-3.5 py-2.5 rounded-2xl ${isUser ? "dash-msg-user rounded-tl-sm border" : "dash-msg-ai rounded-tr-sm"}`}>
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
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
 
                {/* Input */}
                <div className="px-4 py-3 border-t dash-border flex-shrink-0 dash-sidebar" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
                  {/* Image Preview */}
                  {imagePreview && (
                    <div className="mb-2.5 flex items-center gap-2 bg-white/[0.04] rounded-xl px-3 py-2 border border-white/[0.06]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagePreview} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/60 truncate">{imageFile?.name}</p>
                        <p className="text-[10px] text-white/30">Ready to send</p>
                      </div>
                      <button onClick={cancelImagePreview} className="p-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-all flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 bg-white/[0.06] rounded-xl px-3.5 py-2.5 border border-white/[0.06] focus-within:border-emerald-500/40 transition-colors">
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                    {/* Paperclip / Image button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Send image"
                      className="text-white/30 hover:text-emerald-400 transition-colors flex-shrink-0"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </button>
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (imagePreview ? handleSendImage() : handleSend())}
                      placeholder={imagePreview ? "Add a caption (optional)..." : "Type a message..."}
                      className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                    />
                    {imagePreview ? (
                      <button onClick={handleSendImage} disabled={sendingImage} className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0">
                        {sendingImage ? (
                          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        )}
                      </button>
                    ) : (
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
                    )}
                  </div>
                </div>
              </div>
 
              {/* Mobile details backdrop overlay */}
              {showDetails && (
                <div 
                  className="fixed inset-0 bg-black/60 z-30 md:hidden transition-opacity duration-300"
                  onClick={() => setShowDetails(false)}
                />
              )}

              {/* ── RIGHT DETAILS PANEL ── */}
              {showDetails && (
                <div className={`
                  fixed inset-y-0 right-0 z-40 w-[280px] sm:w-[320px] md:relative md:w-[240px] md:z-0
                  border-l dash-border flex flex-col overflow-y-auto flex-shrink-0 shadow-2xl md:shadow-none
                  transition-all duration-300 ease-in-out dash-sidebar
                `}>
                  <div className="p-4 space-y-5">
                    {/* Mobile Close Header */}
                    <div className="flex md:hidden items-center justify-between pb-3 border-b dash-border mb-2">
                      <span className="text-sm font-bold dash-text-primary">Customer Details</span>
                      <button 
                        onClick={() => setShowDetails(false)}
                        className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Customer Info</p>
                      <p className="text-sm font-semibold dash-text-primary">{selected.name || "Unknown"}</p>
                      <p className="text-xs dash-text-secondary mt-0.5">{selected.phone}</p>
                    </div>
 
                    {selected.payment_status === "pending" && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">Verify Payment</p>
                        <p className="text-xs dash-text-secondary mb-3">Screenshot received — verify payment</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleVerifyPayment("approve")} disabled={verifyingPayment} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center justify-center gap-1">✓ Verify</button>
                          <button onClick={() => handleVerifyPayment("reject")} disabled={verifyingPayment} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 transition-all disabled:opacity-50 flex items-center justify-center gap-1">✗ Reject</button>
                        </div>
                      </div>
                    )}
 
                    {(selected.payment_status === "verified" || selected.payment_status === "rejected") && (
                      <div>
                        <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Payment Status</p>
                        <span className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold inline-block ${PAYMENT_COLORS[selected.payment_status]}`}>{PAYMENT_LABELS[selected.payment_status]}</span>
                      </div>
                    )}
 
                    {/* QR Payment Section */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
                      <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">QR Payment</p>
                      <input ref={qrFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleQRFileSelect} />
                      <button
                        onClick={() => handleSendQR()}
                        disabled={sendingQR}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/20"
                      >
                        {sendingQR ? (
                          <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Sending...</>
                        ) : (
                          <>💳 Send QR Code</>
                        )}
                      </button>
                      {selected.payment_qr_sent && (
                        <p className="mt-2 text-xs font-medium text-amber-400 text-center flex items-center justify-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Waiting for screenshot
                        </p>
                      )}
                      {business?.qr_image_url ? (
                        <button onClick={() => qrFileInputRef.current?.click()} className="mt-2 text-xs dash-text-secondary hover:text-white transition-colors w-full text-center underline decoration-dotted">
                          Change QR Image
                        </button>
                      ) : (
                        <p className="mt-2 text-xs dash-text-secondary text-center">No QR saved — click above to upload</p>
                      )}
                    </div>
 
                    <div>
                      <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {(selected.tags ?? []).length === 0 && (
                          <p className="text-xs dash-text-secondary">No tags</p>
                        )}
                        {(selected.tags ?? []).map((tag) => (
                          <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-white/[0.08] text-zinc-200 border border-white/10">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="text-zinc-400 hover:text-red-400 transition-colors ml-1 font-bold">×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Add tag..." className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2 text-xs dash-text-primary placeholder:text-white/30 border border-white/[0.08] focus:outline-none focus:border-emerald-500/40" />
                        <button onClick={addTag} className="px-3 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 transition-all text-xs font-semibold">+</button>
                      </div>
                    </div>
 
                    <div>
                      <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Internal Note</p>
                      {selected.internal_note && !noteEditMode ? (
                        // Saved note view
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2 mb-1.5">
                          <p className="text-xs text-amber-200 whitespace-pre-wrap leading-relaxed">{selected.internal_note}</p>
                          <div className="flex gap-1.5 mt-2">
                            <button
                              onClick={() => { setNoteEditMode(true); setNoteInput(selected.internal_note ?? ""); }}
                              className="flex-1 py-1 rounded-md bg-white/[0.07] text-[10px] text-white/50 hover:text-white/80 border border-white/[0.06] transition-all"
                            >✏️ Edit</button>
                            <button
                              onClick={async () => {
                                setNoteInput("");
                                setSavingNote(true);
                                await fetch(`/api/conversations/${selected.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
                                  body: JSON.stringify({ internal_note: "" }),
                                });
                                setSavingNote(false);
                                setConversations((prev) => prev.map((c) => c.id === selected.id ? { ...c, internal_note: "" } : c));
                              }}
                              className="flex-1 py-1 rounded-md bg-red-500/10 text-[10px] text-red-400/70 hover:text-red-400 border border-red-500/20 transition-all"
                            >🗑️ Delete</button>
                          </div>
                        </div>
                      ) : (
                        // Edit / new note view
                        <>
                          <textarea
                            value={noteInput}
                            onChange={(e) => setNoteInput(e.target.value)}
                            placeholder="Add a private note..."
                            rows={3}
                            className="w-full bg-white/[0.04] rounded-lg px-3 py-2 text-xs dash-text-primary placeholder:text-white/30 border border-white/[0.08] focus:outline-none focus:border-emerald-500/40 resize-none"
                          />
                          <div className="flex gap-1.5 mt-1.5">
                            {noteEditMode && (
                              <button
                                onClick={() => setNoteEditMode(false)}
                                className="flex-1 py-1.5 rounded-lg bg-white/[0.05] text-[11px] text-white/30 hover:text-white/60 border border-white/[0.06] transition-all"
                              >Cancel</button>
                            )}
                            <button
                              onClick={async () => { await saveNote(); setNoteEditMode(false); }}
                              disabled={savingNote}
                              className="flex-1 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 font-semibold transition-all text-xs disabled:opacity-50"
                            >
                              {savingNote ? "Saving..." : noteSaved ? "✓ Saved!" : "Save Note"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
 
                    <div>
                      <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Usage</p>
                      <div className="space-y-1.5 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
                        <div className="flex justify-between text-xs"><span className="text-zinc-400">This hour</span><span className="dash-text-primary font-medium">{selected.msg_count_hour ?? 0} msgs</span></div>
                        <div className="flex justify-between text-xs"><span className="text-zinc-400">Today</span><span className="dash-text-primary font-medium">{selected.msg_count_day ?? 0} msgs</span></div>
                        <div className="flex justify-between text-xs"><span className="text-zinc-400">This month</span><span className="dash-text-primary font-medium">{selected.msg_count_month ?? 0} msgs</span></div>
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

