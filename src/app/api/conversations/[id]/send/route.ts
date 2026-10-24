import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage, extractWamid } from "@/lib/whatsapp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { message } = body;

  if (!message?.trim()) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Get conversation + business credentials
  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("phone, business_id")
    .eq("id", id)
    .single();

  if (convoError || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Fetch business credentials if linked
  let phoneNumberId: string | undefined;
  let accessToken: string | undefined;

  if (conversation.business_id) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("phone_number_id, access_token")
      .eq("id", conversation.business_id)
      .single();

    if (biz) {
      phoneNumberId = biz.phone_number_id;
      accessToken = biz.access_token;
    }
  }

  // Send via WhatsApp using business credentials
  const waResult = await sendWhatsAppMessage(conversation.phone, message, { phoneNumberId, accessToken });

  // Store in DB
  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      role: "assistant",
      source: "dashboard",
      content: message,
      whatsapp_msg_id: extractWamid(waResult),
    })
    .select()
    .single();

  if (msgError) {
    return Response.json({ error: msgError.message }, { status: 500 });
  }

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return Response.json(msg);
}
