import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";
import { checkAndUpdateRateLimit } from "@/lib/ratelimiter";
import { processAndStoreMedia, getMediaCategory } from "@/lib/media";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const supabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages?.[0]) {
    return Response.json({ status: "no_message" });
  }

  const message = value.messages[0];
  const contact = value.contacts?.[0];
  const incomingPhoneNumberId = value.metadata?.phone_number_id as string | undefined;

  const phone = message.from;
  const name = contact?.profile?.name || null;
  const whatsappMsgId = message.id;

  // Determine message type and content
  const msgType = message.type as string;
  let text = "";
  let mediaId: string | null = null;

  if (msgType === "text") {
    text = message.text?.body ?? "";
  } else if (["image", "audio", "video", "document", "sticker"].includes(msgType)) {
    mediaId = message[msgType]?.id ?? null;
    text = message[msgType]?.caption ?? `[${msgType}]`;
  } else {
    return Response.json({ status: "unsupported_type" });
  }

  try {
    // Look up business by incoming phone_number_id
    let businessId: string | null = null;
    let businessAccessToken: string | null = null;
    let businessApiKey: string | null = null;
    let businessModel: string | null = null;
    let businessSystemPrompt: string | null = null;
    let businessWelcomeMessage: string | null = null;

    if (incomingPhoneNumberId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("id, access_token, openrouter_api_key, ai_model, system_prompt, welcome_message")
        .eq("phone_number_id", incomingPhoneNumberId)
        .eq("is_active", true)
        .single();

      if (biz) {
        businessId = biz.id;
        businessAccessToken = biz.access_token;
        businessApiKey = biz.openrouter_api_key;
        businessModel = biz.ai_model;
        businessSystemPrompt = biz.system_prompt;
        businessWelcomeMessage = biz.welcome_message;
      }
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .eq("business_id", businessId)
      .maybeSingle();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ phone, name, business_id: businessId })
        .select()
        .single();
      conversation = newConvo;
    } else if (name && name !== conversation.name) {
      await supabase.from("conversations").update({ name }).eq("id", conversation.id);
    }

    if (!conversation) {
      return Response.json({ error: "Failed to create conversation" }, { status: 500 });
    }

    // Process and store media if present
    let mediaUrl: string | null = null;
    let mediaType: "image" | "audio" | "document" | "video" | "sticker" | null = null;
    let isPaymentScreenshot = false;

    if (mediaId && businessAccessToken) {
      const stored = await processAndStoreMedia(mediaId, businessAccessToken, conversation.id);
      if (stored) {
        mediaUrl = stored.publicUrl;
        mediaType = stored.mediaType;
        // Auto-flag images as potential payment screenshots
        if (mediaType === "image") {
          isPaymentScreenshot = true;
          // ALWAYS update payment_status to pending for new images
          if (conversation.payment_status !== "pending") {
            await supabase
              .from("conversations")
              .update({ payment_status: "pending" })
              .eq("id", conversation.id);
          }
        }
      }
    } else if (mediaId && !businessAccessToken) {
      // Fallback: derive category from msgType
      mediaType = getMediaCategory(msgType === "sticker" ? "image/webp" : `${msgType}/mp4`);
    }

    // Store user message (ignore duplicates)
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      whatsapp_msg_id: whatsappMsgId,
      media_url: mediaUrl,
      media_type: mediaType,
      is_payment_screenshot: isPaymentScreenshot,
    });

    if (insertError?.code === "23505") {
      return Response.json({ status: "duplicate" });
    }

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // If mode is 'human', don't auto-reply
    if (conversation.mode === "human") {
      return Response.json({ status: "stored_for_human" });
    }

    // Fetch conversation history (last 20 messages for context)
    const { data: historyData } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const history = (historyData || []).reverse();

    // Send fixed welcome message for first message
    if (conversation.is_first_message) {
      // Use the client's custom message, or a generic fallback for new clients
      const welcomeMsg =
        businessWelcomeMessage ??
        `Hey! 👋 I'm your AI assistant. How can I help you today? 😊`;

      await sendWhatsAppMessage(phone, welcomeMsg, {
        phoneNumberId: incomingPhoneNumberId,
        accessToken: businessAccessToken ?? undefined,
      });

      await supabase
        .from("conversations")
        .update({
          is_first_message: false,
          msg_count_hour: 1,
          msg_count_day: 1,
          msg_count_month: 1,
        })
        .eq("id", conversation.id);

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: welcomeMsg,
      });

      return NextResponse.json({ success: true });
    }

    // Check rate limits
    const limit = await checkAndUpdateRateLimit(conversation.id, conversation);
    if (!limit.allowed) {
      await sendWhatsAppMessage(phone, limit.message!, {
        phoneNumberId: incomingPhoneNumberId,
        accessToken: businessAccessToken ?? undefined,
      });
      return NextResponse.json({ success: true });
    }

    // Call AI with per-business overrides
    const { reply, error } = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      businessSystemPrompt ?? undefined,
      businessApiKey ?? undefined,
      businessModel ?? undefined
    );

    // If AI failed — switch to human mode automatically
    if (error) {
      await supabase.from("conversations").update({ mode: "human" }).eq("id", conversation.id);
    }

    // Always send a reply — either AI or fallback
    await sendWhatsAppMessage(phone, reply, {
      phoneNumberId: incomingPhoneNumberId,
      accessToken: businessAccessToken ?? undefined,
    });

    // Store AI response
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
    });

    // Update conversation timestamp again
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return Response.json({ status: "replied" });
  } catch (error) {
    console.error("Webhook error:", error);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
