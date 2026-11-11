/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, after } from "next/server";
import crypto from "crypto";
import { sendWhatsAppMessage, extractWamid } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";
import { checkAndUpdateRateLimit } from "@/lib/ratelimiter";
import { processAndStoreMedia } from "@/lib/media";
import { analyzeImage, analyzeVoiceNote, describeMediaForAI, type ImageAnalysis } from "@/lib/media-ai";
import { getSupabase } from "@/lib/supabase";
import { parseDeliveryStatusEvent } from "@/lib/delivery-status";
import { enqueueOwnerAlert, resolveOwnerAlertsForConversation } from "@/lib/owner-alerts";
import { recordContactActivity } from "@/lib/activity";
import { cancelAutomationForConversation, enqueueAutomationForConversation } from "@/lib/automation-queue";
import { isPersonHandoffRequest } from "@/lib/handoff";
import { appendHandoffRules, isConfiguredGreeting, rewriteConfiguredUrls } from "@/lib/assistant-config";
import { parseClickToChatSource } from "@/lib/integrations";
import { getRelevantKnowledgeContext } from "@/lib/knowledge";

// Voice/vision + AI reply can take several seconds. We ack Meta immediately and
// keep working via after(); this raises the ceiling for that background work.
export const maxDuration = 60;

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

/* ───────────────────────── GET: webhook verification ───────────────────────── */

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[webhook] WHATSAPP_VERIFY_TOKEN is not configured");
    return new Response("Webhook verification is not configured", { status: 503 });
  }
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === verifyToken) {
    return new Response(p.get("hub.challenge"), { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/* ───────────────────────── Signature Verification ───────────────────────── */

function verifySignature(raw: string, header: string | null): boolean {
  const mode = (process.env.META_APP_SIGNATURE_MODE ?? (process.env.NODE_ENV === "production" ? "enforce" : "off")).toLowerCase();
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
            // Status receipts and inbound messages are both sent on the "messages" field.
            for (const status of value.statuses ?? []) await handleDeliveryStatus(value, status);
            for (const m of value.messages ?? []) await handleIncoming(value, m);
        }
      } catch (err) {
        console.error(`[webhook] ${change.field} handler error:`, err);
      }
    }
  }
}

async function handleDeliveryStatus(value: any, event: any) {
  const update = parseDeliveryStatusEvent(event);
  const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
  if (!update || !phoneNumberId) return;

  const supabase = getSupabase();
  // Resolve the sender tenant even when its account has since been disconnected.
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (businessError) {
    console.error("[webhook] delivery status business lookup failed:", businessError.message);
    return;
  }
  if (!business) return;

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, conversation_id")
    .eq("whatsapp_msg_id", update.messageId)
    .eq("role", "assistant")
    .maybeSingle();
  if (messageError) {
    console.error("[webhook] delivery status message lookup failed:", messageError.message);
    return;
  }
  if (!message) {
    const { data: campaignRecipient } = await supabase.from("campaign_recipients").select("id,status,business_id").eq("meta_message_id", update.messageId).eq("business_id", business.id).maybeSingle();
    if (!campaignRecipient) return;
    const next = update.status === "failed" ? "failed" : update.status;
    const ranks: Record<string, number> = { sent: 1, delivered: 2, read: 3, replied: 4, paid: 5 };
    if (next === "failed" && ["sent", "queued", "processing"].includes(campaignRecipient.status)) {
      await supabase.from("campaign_recipients").update({ status: "failed", error_code: update.errorCode }).eq("id", campaignRecipient.id).eq("business_id", business.id);
    } else if (ranks[next] && ranks[next] > (ranks[campaignRecipient.status] ?? 0)) {
      const timestamp = new Date().toISOString();
      await supabase.from("campaign_recipients").update({ status: next, ...(next === "delivered" ? { delivered_at: timestamp } : {}), ...(next === "read" ? { read_at: timestamp } : {}) }).eq("id", campaignRecipient.id).eq("business_id", business.id);
    }
    return;
  }

  // WAMIDs are unique, but also verify the conversation belongs to the webhook tenant.
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", message.conversation_id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (conversationError) {
    console.error("[webhook] delivery status conversation lookup failed:", conversationError.message);
    return;
  }
  if (!conversation) return;

  let query = supabase
    .from("messages")
    .update({ delivery_status: update.status, delivery_error_code: update.errorCode })
    .eq("id", message.id);
  const allowed = update.eligiblePreviousStatuses.map((status) => `delivery_status.eq.${status}`);
  query = query.or(["delivery_status.is.null", ...allowed].join(","));
  const { error } = await query;
  if (error) console.error("[webhook] delivery status update failed:", error.message);
}

/* ───────────────────────── shared helpers ───────────────────────── */

async function getBusiness(phoneNumberId?: string) {
  if (!phoneNumberId) return null;
  const { data } = await getSupabase()
    .from("businesses")
    .select(
      "id, access_token, openrouter_api_key, ai_model, system_prompt, welcome_message, handoff_minutes, vision_model, media_ai_enabled, coexistence_enabled, modules_enabled, handoff_rules, handoff_keywords, greeting_phrases, url_rewrite_from, url_rewrite_to, platform_suspended"
    )
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .eq("platform_suspended", false)
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
        ? "Thanks for sending your payment screenshot. Our team will check it against the payment account and confirm here. A screenshot alone does not confirm payment."
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

function isPaymentImage(analysis: ImageAnalysis): boolean {
  if (analysis.category === "payment_screenshot") return true;
  if (analysis.payment && [analysis.payment.amount, analysis.payment.transaction_id, analysis.payment.date, analysis.payment.payee].some((value) => typeof value === "string" && value.trim())) return true;
  return false;
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
  const systemPrompt = appendHandoffRules(
    rewriteConfiguredUrls(biz?.system_prompt, biz?.url_rewrite_from, biz?.url_rewrite_to),
    biz?.handoff_rules
  );
  const welcomeMessage = rewriteConfiguredUrls(biz?.welcome_message, biz?.url_rewrite_from, biz?.url_rewrite_to);
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
    }
  }
  // Download failed (or no token): still record what kind of media it was.
  if (mediaId && !mediaType) mediaType = (msgType === "sticker" ? "sticker" : msgType) as MediaType;
  const paymentWasRequested = mediaType === "image" && conversation.payment_qr_sent === true;
  // Without image analysis, the customer sending a picture immediately after the requested payment proof is the review signal.
  if (paymentWasRequested && !isMediaAiEnabled) isPaymentScreenshot = true;

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
  if (isPaymentScreenshot) {
    await supabase.from("conversations").update({ payment_status: "pending", payment_amount: null, payment_qr_sent: false }).eq("id", conversation.id);
  }

  // Contact writes are opt-in per tenant; with the flag off, legacy webhook behavior is preserved.
  let contactId: string | null = null;
  if (biz?.modules_enabled?.contacts === true && businessId) {
    const attributedCode = biz.modules_enabled?.integrations === true ? parseClickToChatSource(text) : null;
    let attributedSource: string | null = null;
    if (attributedCode) {
      const { data: sourceLink } = await supabase.from("integration_links").select("source_code").eq("business_id", businessId).eq("source_code", attributedCode).maybeSingle();
      attributedSource = sourceLink?.source_code ?? null;
    }
    const { data: contact } = await supabase.from("contacts").upsert({
      business_id: businessId, phone, name: name || null, source: attributedSource ?? "whatsapp", conversation_id: conversation.id,
    }, { onConflict: "business_id,phone", ignoreDuplicates: true }).select("id").maybeSingle();
    contactId = contact?.id ?? null;
    if (!contactId) {
      const { data: existingContact } = await supabase.from("contacts").select("id,source").eq("business_id", businessId).eq("phone", phone).maybeSingle();
      contactId = existingContact?.id ?? null;
      if (contactId) await supabase.from("contacts").update({ conversation_id: conversation.id, ...(attributedSource && ["whatsapp", "conversation"].includes(existingContact?.source ?? "") ? { source: attributedSource } : {}), updated_at: new Date().toISOString() }).eq("id", contactId).eq("business_id", businessId);
    }
    if (biz?.modules_enabled?.campaigns === true) {
      const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const { data: recipient } = await supabase.from("campaign_recipients").select("id,campaign_id,status,contact_id").eq("business_id", businessId).eq("phone", phone).gte("sent_at", windowStart).in("status", ["sent", "delivered", "read"]).order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (recipient) {
        await supabase.from("campaign_recipients").update({ status: "replied", replied_at: new Date().toISOString() }).eq("id", recipient.id).eq("business_id", businessId);
        await supabase.from("activity_events").insert({ business_id: businessId, contact_id: recipient.contact_id, conversation_id: conversation.id, event_type: "campaign_replied", details: { campaign_id: recipient.campaign_id, attribution: "within 7 days" } });
      }
    }
    if (contactId) {
      await cancelAutomationForConversation(businessId, conversation.id, "Customer replied");
      await enqueueAutomationForConversation(businessId, conversation.id, "follow_up", `inbound:${message.id}`);
    }
    if (msgType === "text" && /^\s*(stop|unsubscribe|stop all)\s*[.!]?\s*$/i.test(text)) {
      await supabase.from("contacts").update({ opt_out_at: new Date().toISOString() }).eq("business_id", businessId).eq("phone", phone);
      const resolvedContact = contactId ? { id: contactId } : (await supabase.from("contacts").select("id").eq("business_id", businessId).eq("phone", phone).maybeSingle()).data;
      if (resolvedContact?.id) await supabase.from("activity_events").insert({ business_id: businessId, contact_id: resolvedContact.id, conversation_id: conversation.id, event_type: "opt_out", details: { source: "whatsapp_keyword" } });
      return;
    }
    if (isPaymentScreenshot) await recordContactActivity(supabase, businessId, conversation.id, "payment_pending");
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

  const markPaymentScreenshot = async () => {
    if (isPaymentScreenshot) return;
    isPaymentScreenshot = true;
    if (messageRowId) {
      await supabase.from("messages").update({ is_payment_screenshot: true }).eq("id", messageRowId);
    }
    await supabase
      .from("conversations")
      .update({ payment_status: "pending", payment_amount: null, payment_qr_sent: false, updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
    if (businessId) {
      await recordContactActivity(supabase, businessId, conversation.id, "payment_pending");
      await enqueueOwnerAlert(businessId, conversation.id, "payment", message.id);
    }
  };

  if (isPaymentScreenshot && businessId) {
    await enqueueOwnerAlert(businessId, conversation.id, "payment", message.id);
  }

  if (msgType === "text" && isPersonHandoffRequest(text, biz?.handoff_keywords ?? [])) {
    if (conversation.mode !== "human") {
      await supabase
        .from("conversations")
        .update({
          mode: "human",
          ...(isCoexistenceEnabled ? { ai_paused_until: minutesFromNow(handoffMinutes) } : {}),
        })
        .eq("id", conversation.id);
      await reply(HANDOFF_REPLY);
    }
    if (businessId) await enqueueOwnerAlert(businessId, conversation.id, "handoff", message.id);
    return;
  }

  // A voice note must never receive the canned "team will listen" response
  // unless it is actually routed to the team. Businesses without voice AI
  // still get a real handoff and owner alert for audio messages.
  if (msgType === "audio" && !isMediaAiEnabled) {
    if (conversation.mode !== "human") {
      await supabase.from("conversations").update({ mode: "human" }).eq("id", conversation.id);
      await reply(HANDOFF_REPLY);
    }
    if (businessId) await enqueueOwnerAlert(businessId, conversation.id, "handoff", message.id);
    return;
  }

  // Image understanding is opt-in per business. If it is off, don't promise the
  // team will inspect a photo while leaving the chat in AI mode.
  if (msgType === "image" && !isMediaAiEnabled) {
    if (isPaymentScreenshot) {
      await reply(cannedMediaReply("image", true));
      return;
    }
    if (conversation.mode !== "human") {
      await supabase.from("conversations").update({ mode: "human" }).eq("id", conversation.id);
      await reply(HANDOFF_REPLY);
    }
    if (businessId) await enqueueOwnerAlert(businessId, conversation.id, "handoff", message.id);
    return;
  }

  /* ── should the AI answer at all? ──
     Manual/paused chats still need media transcription and image analysis so
     the team can understand what was sent; they must not receive an AI reply. */
  const aiPaused = isCoexistenceEnabled && conversation.ai_paused_until && new Date(conversation.ai_paused_until) > new Date();
  const suppressAiReply = conversation.mode === "human" || Boolean(aiPaused);
  if (suppressAiReply && !(isMediaAiEnabled && (msgType === "audio" || msgType === "image"))) return;

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

      const isJustGreeting = isConfiguredGreeting(text, biz?.greeting_phrases);
      if (isJustGreeting) return;
    }

    // Rate limits
    const limit = await checkAndUpdateRateLimit(conversation.id, conversation);
    if (!limit.allowed) {
      await sendWhatsAppMessage(phone, limit.message!, sendOpts);
      return;
    }

    // Call AI with legacy global instructions
    const knowledgeQuery = history.filter((m: any) => m.role === "user").slice(-2).map((m: any) => `${m.content} ${m.transcript ?? ""} ${JSON.stringify(m.media_analysis ?? "")}`).join(" ");
    const knowledge = businessId ? await getRelevantKnowledgeContext(supabase, businessId, knowledgeQuery) : "";
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
      `${systemPrompt ?? ""}${knowledge}`,
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
        needsHuman = r.analysis.needs_human || isPersonHandoffRequest(r.analysis.transcript, biz?.handoff_keywords ?? []);
        await supabase
          .from("messages")
          .update({ transcript: r.analysis.transcript, media_analysis: r.analysis })
          .eq("id", messageRowId);
      } else {
        console.warn("[webhook] voice analysis skipped:", r.reason);
        needsHuman = true;
      }
    } else {
      const r = await analyzeImage(mediaBuffer, mediaMime, text === "[image]" ? null : text, opts);
      if (r.ok) {
        analysed = true;
        needsHuman = r.analysis.needs_human;
        await supabase.from("messages").update({ media_analysis: r.analysis }).eq("id", messageRowId);
        if (isPaymentImage(r.analysis)) await markPaymentScreenshot();
      } else {
        console.warn("[webhook] image analysis skipped:", r.reason);
      }
    }
  }

  // Download failures (or missing media credentials) also need a human follow-up.
  if (msgType === "audio" && !analysed) needsHuman = true;
  if (msgType === "image" && !analysed && paymentWasRequested) await markPaymentScreenshot();
  if (msgType === "image" && !analysed && !isPaymentScreenshot) needsHuman = true;

  // Store analysis in manual/paused chats, but leave replies and handoff state to the team.
  if (suppressAiReply) return;

  // Payment screenshots always go to the payment review queue. The model may
  // read visible fields, but only a person checks the bank/UPI account.
  if (msgType === "image" && isPaymentScreenshot) {
    await reply(cannedMediaReply("image", true));
    return;
  }

  /* ── escalate: complaint / unreadable / ID document → a person ── */
  if (needsHuman) {
    await supabase
      .from("conversations")
      .update({
        mode: "human",
        ...(isCoexistenceEnabled ? { ai_paused_until: minutesFromNow(handoffMinutes) } : {}),
      })
      .eq("id", conversation.id);
    await reply(HANDOFF_REPLY);
    if (businessId) await enqueueOwnerAlert(businessId, conversation.id, "handoff", message.id);
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
    await supabase.from("conversations").update({ is_first_message: false, msg_count_hour: 1, msg_count_day: 1, msg_count_month: 1 }).eq("id", conversation.id);
    if (msgType === "text") {
      const welcomeMsg = welcomeMessage ?? `Hey! 👋 I'm your AI assistant. How can I help you today? 😊`;
      await reply(welcomeMsg);
      const isJustGreeting = isConfiguredGreeting(text, biz?.greeting_phrases);
      if (isJustGreeting) return;
    }
  }

  /* ── rate limits ── */
  const limit = await checkAndUpdateRateLimit(conversation.id, conversation);
  if (!limit.allowed) {
    await sendWhatsAppMessage(phone, limit.message!, sendOpts);
    return;
  }

  /* ── AI reply ── */
  const knowledgeQuery = history.filter((m: any) => m.role === "user").slice(-2).map((m: any) => `${m.content} ${m.transcript ?? ""} ${JSON.stringify(m.media_analysis ?? "")}`).join(" ");
  const knowledge = businessId ? await getRelevantKnowledgeContext(supabase, businessId, knowledgeQuery) : "";
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
    `${systemPrompt ?? ""}${knowledge}`,
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
  await resolveOwnerAlertsForConversation(biz.id, conversation.id, ["handoff"]);
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
