import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";
import { checkAndUpdateRateLimit } from "@/lib/ratelimiter";

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

  // Only process whatsapp_business_account events
  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  // Only process actual messages (not status updates)
  if (!value?.messages?.[0]) {
    return Response.json({ status: "no_message" });
  }

  const message = value.messages[0];
  const contact = value.contacts?.[0];

  // Only handle text messages
  if (message.type !== "text") {
    return Response.json({ status: "non_text" });
  }

  const phone = message.from;
  const text = message.text.body;
  const name = contact?.profile?.name || null;
  const whatsappMsgId = message.id;

  try {
    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ phone, name })
        .select()
        .single();
      conversation = newConvo;
    } else if (name && name !== conversation.name) {
      await supabase
        .from("conversations")
        .update({ name })
        .eq("id", conversation.id);
    }

    if (!conversation) {
      return Response.json({ error: "Failed to create conversation" }, { status: 500 });
    }

    // Store user message (ignore duplicates)
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      whatsapp_msg_id: whatsappMsgId,
    });

    if (insertError?.code === "23505") {
      // Duplicate message, ignore
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
      const welcomeMsg = `Hey! 👋 Welcome to Cenexa Systems — I'm Cera, your AI assistant.

We help businesses grow with smart tech — WhatsApp bots, websites, custom software, and automation.

What can I help you with today? 😊`;

      await sendWhatsAppMessage(phone, welcomeMsg);

      await supabase.from("conversations").update({
        is_first_message: false,
        msg_count_hour: 1,
        msg_count_day: 1,
        msg_count_month: 1,
      }).eq("id", conversation.id);

      // Store AI (welcome) response
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
      await sendWhatsAppMessage(phone, limit.message!);
      return NextResponse.json({ success: true });
    }

    // Call AI with full error handling
    const { reply, error } = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );

    // If AI failed — switch to human mode automatically
    if (error) {
      await supabase.from("conversations").update({
        mode: "human"
      }).eq("id", conversation.id);
    }

    // Always send a reply — either AI or fallback
    await sendWhatsAppMessage(phone, reply);

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
