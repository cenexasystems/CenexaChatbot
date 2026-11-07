import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess } from "@/lib/api-auth";
import { extractWamid, sendWhatsAppImage } from "@/lib/whatsapp";
import { resolveOwnerAlertsForConversation } from "@/lib/owner-alerts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, admin } = access;
  const body = await request.json();
  const { imageUrl } = body; // optional — if provided, save as business QR for future use

  // Get conversation details
  const { conversation, error: convoError } = await getOwnedConversation(admin, businessId, id, "phone, business_id");
  if (convoError) return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  if (!conversation) return conversationNotFound();
  const typedConversation = conversation as { phone: string; business_id: string };

  // Get business credentials + stored QR URL
  const { data: biz } = await admin
    .from("businesses")
    .select("phone_number_id, access_token, qr_image_url")
    .eq("id", businessId)
    .single();

  if (!biz) {
    return Response.json({ error: "Business not found" }, { status: 404 });
  }

  // Use provided URL or fall back to stored QR
  const qrUrl = imageUrl || biz.qr_image_url;

  if (!qrUrl) {
    return Response.json(
      { error: "No QR image set. Please upload a QR image first." },
      { status: 400 }
    );
  }

  // If a new image URL was provided, save it as the business QR for future use
  if (imageUrl && imageUrl !== biz.qr_image_url) {
    await admin
      .from("businesses")
      .update({ qr_image_url: imageUrl })
      .eq("id", businessId);
  }

  // Send QR image to customer via WhatsApp
  const waResult = await sendWhatsAppImage(
    typedConversation.phone,
    qrUrl,
    "Please scan this QR code to complete your payment 💳\n\nOnce paid, please reply with a screenshot of your payment so we can confirm it! 💛",
    { phoneNumberId: biz.phone_number_id, accessToken: biz.access_token }
  );

  if (waResult.error) {
    return Response.json({ error: waResult.error }, { status: 500 });
  }

  // Set payment_qr_sent = true so next image from customer is treated as payment
  await admin
    .from("conversations")
    .update({
      payment_qr_sent: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", businessId);

  // Log the QR send as a message
  await admin.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    source: "dashboard",
    content: "Please scan this QR code to complete your payment 💳\n\nOnce paid, please reply with a screenshot of your payment so we can confirm it! 💛",
    whatsapp_msg_id: extractWamid(waResult),
    media_url: qrUrl,
    media_type: "image",
  });
  await resolveOwnerAlertsForConversation(businessId, id, ["handoff"]);

  return Response.json({ success: true, qrUrl });
}
