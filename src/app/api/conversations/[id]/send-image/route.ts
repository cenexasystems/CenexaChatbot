import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess, requireStrictPermission } from "@/lib/api-auth";
import { sendWhatsAppImage, extractWamid } from "@/lib/whatsapp";
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
  const { imageUrl, caption = "" } = body;

  if (!imageUrl) {
    return Response.json({ error: "imageUrl is required" }, { status: 400 });
  }

  // Get conversation details
  const { conversation, error: convoError } = await getOwnedConversation(admin, businessId, id, "phone, business_id");
  if (convoError) return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  if (!conversation) return conversationNotFound();
  const typedConversation = conversation as { phone: string; business_id: string };

  // Get business credentials
  const { data: biz } = await admin
    .from("businesses")
    .select("phone_number_id, access_token")
    .eq("id", businessId)
    .single();

  if (!biz) {
    return Response.json({ error: "Business not found" }, { status: 404 });
  }

  // Send image to customer via WhatsApp
  const waResult = await sendWhatsAppImage(
    typedConversation.phone,
    imageUrl,
    caption,
    { phoneNumberId: biz.phone_number_id, accessToken: biz.access_token }
  );

  if (waResult.error) {
    return Response.json({ error: waResult.error }, { status: 500 });
  }

  // Log the message in DB so it shows in the dashboard
  await admin.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    source: "dashboard",
    whatsapp_msg_id: extractWamid(waResult),
    content: caption || "[Image]",
    media_url: imageUrl,
    media_type: "image",
  });

  // Update conversation timestamp
  await admin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);
  await resolveOwnerAlertsForConversation(businessId, id, ["handoff"]);

  return Response.json({ success: true });
}
