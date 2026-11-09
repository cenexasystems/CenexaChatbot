import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess, requireStrictPermission } from "@/lib/api-auth";
import { sendWhatsAppMessage, extractWamid } from "@/lib/whatsapp";
import { resolveOwnerAlertsForConversation } from "@/lib/owner-alerts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requireStrictPermission(access, "conversation_reply"); if (denied) return denied;
  const { businessId, admin } = access;
  const body = await request.json();
  const { message } = body;

  if (!message?.trim()) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  // Get conversation + business credentials
  const { conversation, error: convoError } = await getOwnedConversation(admin, businessId, id, "phone, business_id");
  if (convoError) return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  if (!conversation) return conversationNotFound();
  const typedConversation = conversation as { phone: string; business_id: string };

  // Fetch business credentials if linked
  let phoneNumberId: string | undefined;
  let accessToken: string | undefined;

  if (typedConversation.business_id) {
    const { data: biz } = await admin
      .from("businesses")
      .select("phone_number_id, access_token")
      .eq("id", businessId)
      .single();

    if (biz) {
      phoneNumberId = biz.phone_number_id;
      accessToken = biz.access_token;
    }
  }

  // Send via WhatsApp using business credentials
  const waResult = await sendWhatsAppMessage(typedConversation.phone, message, { phoneNumberId, accessToken });

  // Store in DB
  const { data: msg, error: msgError } = await admin
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
  await admin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);
  if (!waResult?.error) await resolveOwnerAlertsForConversation(businessId, id, ["handoff"]);

  return Response.json(msg);
}
