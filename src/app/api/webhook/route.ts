/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, after } from "next/server";
import crypto from "crypto";
import { sendWhatsAppMessage, extractWamid } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";
import { checkAndUpdateRateLimit } from "@/lib/ratelimiter";
import { processAndStoreMedia } from "@/lib/media";
import { analyzeImage, analyzeVoiceNote, describeMediaForAI } from "@/lib/media-ai";
import { getSupabase } from "@/lib/supabase";

// Voice/vision + AI reply can take several seconds. We ack Meta immediately and
// keep working via after(); this raises the ceiling for that background work.
export const maxDuration = 60;

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

/* ───────────────────────── GET: webhook verification ───────────────────────── */

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge"), { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/* ───────────────────────── Signature Verification ───────────────────────── */

function verifySignature(raw: string, header: string | null): boolean {
  const mode = (process.env.META_APP_SIGNATURE_MODE ?? "off").toLowerCase();
  if (mode === "off") {
    return true;
  }

  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    if (mode === "enforce") {
      console.error("[webhook] META_APP_SIGNATURE_MODE=enforce but META_APP_SECRET is not set! Rejecting.");
      return false;
    }
    console.warn("[webhook] META_APP_SECRET not set in log mode; skipping check.");
    return true;
  }

  if (!header?.startsWith("sha256=")) {
    if (mode === "enforce") return false;
    console.warn("[webhook] signature missing or malformed in log mode:", header);
    return true;
  }

  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.slice(7);
  const isValid = got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));

  if (!isValid) {
    if (mode === "enforce") {
      return false;
    }
    console.warn("[webhook] signature mismatch detected in log mode. Header:", header);
    return true; // Still allow through in log mode
  }

  return true;
}

/* ───────────────────────── POST: receive events ───────────────────────── */

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ status: "bad_json" }, { status: 400 });
  }
  if (body.object !== "whatsapp_business_account") return Response.json({ status: "ignored" });

  // Ack now; process after the response. Duplicates are safe: messages.whatsapp_msg_id is unique.
  after(async () => {
    try {
      await processPayload(body);
    } catch (err) {
      console.error("[webhook] fatal background processing error:", err);
    }
  });
  return Response.json({ status: "accepted" });
}

async function processPayload(body: any) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      try {
        switch (change.field) {
          case "smb_message_echoes":
            for (const echo of value.message_echoes ?? []) await handleEcho(value, echo);
            break;
          case "history":
            await handleHistory(value);
            break;
          case "smb_app_state_sync":
            await handleAppStateSync(value);
            break;
          case "account_update":
            await handleAccountUpdate(entry.id, value);
            break;
          default:
            // "messages" (and legacy payloads without a field name)
            for (const m of value.messages ?? []) await handleIncoming(value, m);
        }
      } catch (err) {
        console.error(`[webhook] ${change.field} handler error:`, err);
      }
    }
  }
}

/* ───────────────────────── shared helpers ───────────────────────── */

const fixUrl = (s: string | null) =>
  s ? s.replace(/https:\/\/b2-bridal-studio-upgraded\.vercel\.app/g, "https://b2bridalstudio.com") : null;

async function getBusiness(phoneNumberId?: string) {
  if (!phoneNumberId) return null;
  const { data } = await getSupabase()
    .from("businesses")
    .select(
      "id, access_token, openrouter_api_key, ai_model, system_prompt, welcome_message, handoff_minutes, vision_model, media_ai_enabled, coexistence_enabled"
    )
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

async function findOrCreateConversation(
  phone: string,
  name: string | null,
  businessId: string | null,
  opts: { skipWelcome?: boolean } = {}
) {
  const supabase = getSupabase();
  let q = supabase.from("conversations").select("*").eq("phone", phone);
  q = businessId ? q.eq("business_id", businessId) : q.is("business_id", null);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    if (name && name !== existing.name) {
      await supabase.from("conversations").update({ name }).eq("id", existing.id);
    }
    return existing;
  }
  const { data: created } = await supabase
    .from("conversations")
    .insert({
      phone,
      name,
      business_id: businessId,
      // Customers the owner already talks to must not get the "Hi, I'm your AI assistant" welcome.
      ...(opts.skipWelcome ? { is_first_message: false } : {}),
    })
    .select()
    .single();
  return created;
}

function cannedMediaReply(msgType: string, isPayment: boolean): string {
  switch (msgType) {
    case "image":
      return isPayment
        ? "Thank you for the payment screenshot! 🙏 Our team will verify and confirm shortly 💛"
        : "Thank you for sending! 📩 We have received your image. Our team will get back to you shortly 💛";
    case "audio":
      return "Thank you for your voice note! 🎤 Our team will listen and get back to you shortly 💛";
    case "document":
      return "Thank you for sending the document! 📄 Our team will review it and get back to you shortly 💛";
    case "video":
      return "Thank you for the video! 🎥 Our team will take a look and get back to you shortly 💛";
    default:
      return "Thank you for sharing your file. Our team will get back to you shortly 💛";
  }
}

const HANDOFF_REPLY =
  "Thank you for letting us know 🙏 I'm passing this to our team so they can look at it personally and get back to you shortly 💛";

function minutesFromNow(min: number) {
  return new Date(Date.now() + min * 60_000).toISOString();
}

/* ───────────────────────── customer message → AI ───────────────────────── */

async function handleIncoming(value: any, message: any) {
  const supabase = getSupabase();
  const msgType = message.type as string;
  const incomingPhoneNumberId = value.metadata?.phone_number_id as string | undefined;
  const phone: string = message.from;
  const name: string | null = value.contacts?.[0]?.profile?.name || null;

  let text = "";
  let mediaId: string | null = null;
  if (msgType === "text") {
    text = message.text?.body ?? "";
  } else if ((MEDIA_TYPES as readonly string[]).includes(msgType)) {
    mediaId = message[msgType]?.id ?? null;
    text = message[msgType]?.caption ?? `[${msgType}]`;
  } else {
    return; // reactions, location, unsupported etc.
  }

  const biz = await getBusiness(incomingPhoneNumberId);
  const businessId: string | null = biz?.id ?? null;
  const accessToken: string | undefined = biz?.access_token ?? undefined;
  const sendOpts = { phoneNumberId: incomingPhoneNumberId, accessToken };
  const systemPrompt = fixUrl(biz?.system_prompt ?? null);
  const welcomeMessage = fixUrl(biz?.welcome_message ?? null);
  const handoffMinutes: number = biz?.handoff_minutes ?? 60;
  const isMediaAiEnabled = biz?.media_ai_enabled === true;
  const isCoexistenceEnabled = biz?.coexistence_enabled === true;

  const conversation = await findOrCreateConversation(phone, name, businessId);
  if (!conversation) {
    console.error("[webhook] could not create conversation for", phone);
    return;
  }

  /* ── media: download + store ── */
  let mediaUrl: string | null = null;
  let mediaType: MediaType | null = null;
  let mediaBuffer: Buffer | null = null;
  let mediaMime = "";
  let isPaymentScreenshot = false;

  if (mediaId && accessToken) {
    const stored = await processAndStoreMedia(mediaId, accessToken, conversation.id);
    if (stored) {
      mediaUrl = stored.publicUrl;
      mediaType = stored.mediaType as MediaType;
      mediaBuffer = stored.buffer;
      mediaMime = stored.mimeType;
      // Only treat as a payment screenshot if our side asked for payment first.
      if (mediaType === "image" && conversation.payment_qr_sent) {
        isPaymentScreenshot = true;
        await supabase
          .from("conversations")
          .update({ payment_status: "pending", payment_qr_sent: false })
          .eq("id", conversation.id);
      }
    }
  }
  // Download failed (or no token): still record what kind of media it was.
  if (mediaId && !mediaType) mediaType = (msgType === "sticker" ? "sticker" : msgType) as MediaType;

  /* ── store the customer's message (dedupes on wamid) ── */
  const storedText = isPaymentScreenshot && text === "[image]" ? "[Payment Screenshot]" : text;
  const { data: inserted, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "user",
      source: "customer",
      content: storedText,
      whatsapp_msg_id: message.id,
      media_url: mediaUrl,
      media_type: mediaType,
      is_payment_screenshot: isPaymentScreenshot,
    })
    .select("id")
    .single();

  if (insertError?.code === "23505") return; // Meta duplicate retry
  const messageRowId: string | null = inserted?.id ?? null;

  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);

  /* ── should the AI answer at all? ──
     "human" = manual dashboard toggle.
     ai_paused_until = owner replied from WhatsApp Business app (ONLY checked when coexistence_enabled = true). */
  if (conversation.mode === "human") return;

  if (isCoexistenceEnabled) {
    const paused = conversation.ai_paused_until && new Date(conversation.ai_paused_until) > new Date();
    if (paused) return;
  }

  const reply = async (content: string) => {
    const result = await sendWhatsAppMessage(phone, content, sendOpts);
    if (!result?.error) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        source: "ai",
        content,
        whatsapp_msg_id: extractWamid(result),
      });
    }
    return result;
  };

  /* ══════════════════════════════════════════════════════════════
     LEGACY PATH: media_ai_enabled === false
     Byte-for-byte legacy behavior: canned replies for uncaptioned
     media, no transcription or vision models, legacy prompt rules.
     ══════════════════════════════════════════════════════════════ */
  if (!isMediaAiEnabled) {
    // If the user sent media with NO caption, bypass AI completely
    if (mediaType && text === `[${msgType}]`) {
      const cannedText = cannedMediaReply(msgType, isPaymentScreenshot);
      await reply(cannedText);
      return;
    }

    // Fetch conversation history (last 20 messages)
    const { data: historyData } = await supabase
      .from("messages")
      .select("role, content, media_type, is_payment_screenshot")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const history = (historyData || []).reverse();

    // First message welcome
    if (conversation.is_first_message) {
      const welcomeMsg = welcomeMessage ?? `Hey! 👋 I'm your AI assistant. How can I help you today? 😊`;
      await reply(welcomeMsg);
      await supabase
        .from("conversations")
        .update({ is_first_message: false, msg_count_hour: 1, msg_count_day: 1, msg_count_month: 1 })
        .eq("id", conversation.id);

      const isJustGreeting = /^(hi|hello|hey|hii|helo|hai|வணக்கம்|ஹலோ)\s*[!?.]*\s*$/i.test(text.trim());
      if (isJustGreeting) return;
    }

    // Rate limits
    const limit = await checkAndUpdateRateLimit(conversation.id, conversation);
    if (!limit.allowed) {
      await sendWhatsAppMessage(phone, limit.message!, sendOpts);
      return;
    }

    // Call AI with legacy global instructions
    const aiResult = await getAIResponse(
      history.map((m: any) => {
        let aiContent = m.content;
        if (m.media_type === "image" && m.role === "user") {
          aiContent = m.is_payment_screenshot
            ? `[System Note: User attached a Payment Screenshot] ${m.content}`
            : `[System Note: User attached a General Image] ${m.content}`;
        }
        return {
          role: m.role as "user" | "assistant",
          content: aiContent,
        };
      }),
      systemPrompt ?? undefined,
      biz?.openrouter_api_key ?? undefined,
      biz?.ai_model ?? undefined,
      false // mediaAiEnabled = false -> LEGACY_GLOBAL_INSTRUCTIONS
    );
    let aiReply = aiResult.reply;
    const error = aiResult.error;

    if (aiReply) aiReply = aiReply.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2");

    const lower = (aiReply ?? "").toLowerCase();
    const setPaymentQrSent =
      lower.includes("screenshot") && (lower.includes("gpay") || lower.includes("upi") || lower.includes("pay"));

    if (error) await supabase.from("conversations").update({ mode: "human" }).eq("id", conversation.id);

    const waResult = await sendWhatsAppMessage(phone, aiReply, sendOpts);
    if (waResult?.error) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        source: "ai",
        content: `❌ WHATSAPP API ERROR: ${JSON.stringify(waResult.error)}`,
      });
      return;
    }

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      source: "ai",
      content: aiReply,
      whatsapp_msg_id: extractWamid(waResult),
    });

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), ...(setPaymentQrSent ? { payment_qr_sent: true } : {}) })
      .eq("id", conversation.id);
    return;
  }

  /* ══════════════════════════════════════════════════════════════
     NEW PATH: media_ai_enabled === true
     Voice transcription + image vision analysis + escalation
     ══════════════════════════════════════════════════════════════ */
  let analysed = false;
  let needsHuman = false;

  if (mediaBuffer && messageRowId && (msgType === "audio" || msgType === "image")) {
    const opts = { apiKey: biz?.openrouter_api_key ?? undefined, model: biz?.vision_model ?? undefined };
    if (msgType === "audio") {
      const r = await analyzeVoiceNote(mediaBuffer, mediaMime, opts);
      if (r.ok) {
        analysed = true;
        needsHuman = r.analysis.needs_human;
        await supabase
          .from("messages")
          .update({ transcript: r.analysis.transcript, media_analysis: r.analysis })
          .eq("id", messageRowId);
      } else {
        console.warn("[webhook] voice analysis skipped:", r.reason);
      }
    } else {
      const r = await analyzeImage(mediaBuffer, mediaMime, text === "[image]" ? null : text, opts);
      if (r.ok) {
        analysed = true;
        needsHuman = r.analysis.needs_human;
        await supabase.from("messages").update({ media_analysis: r.analysis }).eq("id", messageRowId);
      } else {
        console.warn("[webhook] image analysis skipped:", r.reason);
      }
    }
  }

  /* ── escalate: complaint / unreadable / ID document → a person ── */
  if (needsHuman) {
    if (isCoexistenceEnabled) {
      await supabase
        .from("conversations")
        .update({ ai_paused_until: minutesFromNow(handoffMinutes) })
        .eq("id", conversation.id);
    }
    await reply(HANDOFF_REPLY);
    return;
  }

  /* ── deterministic replies where the AI adds nothing (and costs money) ── */
  const bareMedia = !!mediaType && text === `[${msgType}]`;
  if (bareMedia && (isPaymentScreenshot || !analysed)) {
    await reply(cannedMediaReply(msgType, isPaymentScreenshot));
    return;
  }

  /* ── conversation history for the reply model ── */
  const { data: historyData } = await supabase
    .from("messages")
    .select("role, content, media_type, is_payment_screenshot, transcript, media_analysis")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (historyData || []).reverse();

  /* ── first-ever message → welcome ── */
  if (conversation.is_first_message) {
    const welcomeMsg = welcomeMessage ?? `Hey! 👋 I'm your AI assistant. How can I help you today? 😊`;
    await reply(welcomeMsg);
    await supabase
      .from("conversations")
      .update({ is_first_message: false, msg_count_hour: 1, msg_count_day: 1, msg_count_month: 1 })
      .eq("id", conversation.id);

    const isJustGreeting = /^(hi|hello|hey|hii|helo|hai|வணக்கம்|ஹலோ)\s*[!?.]*\s*$/i.test(text.trim());
    if (isJustGreeting) return;
  }

  /* ── rate limits ── */
  const limit = await checkAndUpdateRateLimit(conversation.id, conversation);
  if (!limit.allowed) {
    await sendWhatsAppMessage(phone, limit.message!, sendOpts);
    return;
  }

  /* ── AI reply ── */
  const aiResult = await getAIResponse(
    history.map((m: any) => {
      let content = describeMediaForAI(m) ?? m.content;
      if (content === m.content && m.media_type === "image" && m.role === "user") {
        content = m.is_payment_screenshot
          ? `[System Note: User attached a Payment Screenshot] ${m.content}`
          : `[System Note: User attached a General Image] ${m.content}`;
      }
      return { role: m.role as "user" | "assistant", content };
    }),
    systemPrompt ?? undefined,
    biz?.openrouter_api_key ?? undefined,
    biz?.ai_model ?? undefined,
    true // mediaAiEnabled = true -> MEDIA_GLOBAL_INSTRUCTIONS
  );
  let aiReply = aiResult.reply;
  const error = aiResult.error;

  // WhatsApp doesn't render markdown links.
  if (aiReply) aiReply = aiReply.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2");

  // If the AI just asked for a payment screenshot, treat the next image as one.
  const lower = (aiReply ?? "").toLowerCase();
  const setPaymentQrSent =
    lower.includes("screenshot") && (lower.includes("gpay") || lower.includes("upi") || lower.includes("pay"));

  if (error) await supabase.from("conversations").update({ mode: "human" }).eq("id", conversation.id);

  const waResult = await sendWhatsAppMessage(phone, aiReply, sendOpts);
  if (waResult?.error) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      source: "ai",
      content: `❌ WHATSAPP API ERROR: ${JSON.stringify(waResult.error)}`,
    });
    return;
  }

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    source: "ai",
    content: aiReply,
    whatsapp_msg_id: extractWamid(waResult),
  });
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString(), ...(setPaymentQrSent ? { payment_qr_sent: true } : {}) })
    .eq("id", conversation.id);
}

/* ───────────────────────── coexistence: owner replied from the Business app ───────────────────────── */

async function handleEcho(value: any, echo: any) {
  const biz = await getBusiness(value.metadata?.phone_number_id);
  // Strictly gated: if coexistence is not enabled for this business, echo events are a no-op
  if (!biz || biz.coexistence_enabled !== true) return;

  const supabase = getSupabase();

  // Already known (e.g. a message we sent through the API)? Then it's not a human takeover.
  const { data: known } = await supabase.from("messages").select("id").eq("whatsapp_msg_id", echo.id).maybeSingle();
  if (known) return;

  const customerPhone: string = echo.to;
  const conversation = await findOrCreateConversation(customerPhone, null, biz.id, { skipWelcome: true });
  if (!conversation) return;

  const type: string = echo.type;
  let content = type === "text" ? echo.text?.body ?? "" : echo[type]?.caption ?? `[${type}]`;
  let mediaUrl: string | null = null;
  let mediaType: MediaType | null = null;

  const mediaId = (MEDIA_TYPES as readonly string[]).includes(type) ? echo[type]?.id : null;
  if (mediaId && biz.access_token) {
    const stored = await processAndStoreMedia(mediaId, biz.access_token, conversation.id);
    if (stored) {
      mediaUrl = stored.publicUrl;
      mediaType = stored.mediaType as MediaType;
    }
  }
  if (!content) content = `[${type}]`;

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    source: "business_app",
    content,
    whatsapp_msg_id: echo.id,
    media_url: mediaUrl,
    media_type: mediaType,
  });
  if (error?.code === "23505") return;

  await supabase
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
      is_first_message: false,
      ai_paused_until: minutesFromNow(biz.handoff_minutes ?? 60),
    })
    .eq("id", conversation.id);
}

/* ───────────────────────── coexistence: chat-history import ───────────────────────── */

async function handleHistory(value: any) {
  const biz = await getBusiness(value.metadata?.phone_number_id);
  // Strictly gated by coexistence_enabled
  if (!biz || biz.coexistence_enabled !== true) return;

  const supabase = getSupabase();

  for (const h of value.history ?? []) {
    if (h.errors?.length) {
      // 2593109 = the business chose not to share history. Nothing to import.
      console.log("[webhook] history not shared:", h.errors[0]?.code);
      continue;
    }

    const threads: any[] = h.threads ?? [];
    const phones = threads.map((t) => String(t.id));
    if (!phones.length) continue;

    const { data: existing } = await supabase
      .from("conversations")
      .select("id, phone")
      .eq("business_id", biz.id)
      .in("phone", phones);
    const idByPhone = new Map<string, string>((existing ?? []).map((c: any) => [c.phone, c.id]));

    const missing = threads.filter((t) => !idByPhone.has(String(t.id)));
    if (missing.length) {
      const { data: created } = await supabase
        .from("conversations")
        .insert(
          missing.map((t) => {
            const last = (t.messages ?? []).reduce((a: number, m: any) => Math.max(a, Number(m.timestamp) || 0), 0);
            return {
              phone: String(t.id),
              business_id: biz.id,
              is_first_message: false,
              ...(last ? { updated_at: new Date(last * 1000).toISOString() } : {}),
            };
          })
        )
        .select("id, phone");
      for (const c of created ?? []) idByPhone.set(c.phone, c.id);
    }

    const rows: any[] = [];
    for (const t of threads) {
      const convoId = idByPhone.get(String(t.id));
      if (!convoId) continue;
      for (const m of t.messages ?? []) {
        if (m.type === "media_placeholder") continue; // media bytes arrive separately and are skipped
        const content = m.type === "text" ? m.text?.body : m[m.type]?.caption ?? `[${m.type}]`;
        if (!content) continue;
        rows.push({
          conversation_id: convoId,
          role: String(m.from) === String(t.id) ? "user" : "assistant",
          source: "history",
          content,
          whatsapp_msg_id: m.id,
          created_at: new Date(Number(m.timestamp) * 1000).toISOString(),
        });
      }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("messages")
        .upsert(rows.slice(i, i + 500), { onConflict: "whatsapp_msg_id", ignoreDuplicates: true });
      if (error) console.error("[webhook] history upsert:", error.message);
    }
    console.log(
      `[webhook] history chunk imported: ${rows.length} msgs, phase ${h.metadata?.phase}, progress ${h.metadata?.progress}%`
    );
  }
}

async function handleAppStateSync(value: any) {
  const biz = await getBusiness(value.metadata?.phone_number_id);
  if (!biz || biz.coexistence_enabled !== true) return;
  console.log(`[webhook] smb_app_state_sync: ${value.state_sync?.length ?? 0} contact updates (ack)`);
}

/* ───────────────────────── account lifecycle ───────────────────────── */

async function handleAccountUpdate(wabaId: string, value: any) {
  const supabase = getSupabase();
  // Check if business exists and has coexistence enabled
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, coexistence_enabled")
    .eq("waba_id", wabaId)
    .maybeSingle();

  if (!biz || biz.coexistence_enabled !== true) return;

  const event: string | undefined = value.event;

  if (event === "PARTNER_REMOVED" || event === "ACCOUNT_OFFBOARDED") {
    // e.g. owner tapped "Disconnect account" in the app, or the Business app was inactive ~14 days.
    await supabase
      .from("businesses")
      .update({
        is_active: false,
        coexistence_synced_at: null,
        disconnected_reason: value.disconnection_info?.reason ?? event,
      })
      .eq("waba_id", wabaId);
    console.warn(`[webhook] ${event} for WABA ${wabaId}`, value.disconnection_info ?? "");
  } else if (event === "ACCOUNT_RECONNECTED") {
    await supabase.from("businesses").update({ is_active: true, disconnected_reason: null }).eq("waba_id", wabaId);
  }
}
