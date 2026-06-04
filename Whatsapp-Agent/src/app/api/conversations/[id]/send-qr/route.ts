import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendWhatsAppImage } from "@/lib/whatsapp";

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { imageUrl } = body; // optional — if provided, save as business QR for future use

  const supabase = await createClient();

  // Get conversation details
  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("phone, business_id")
    .eq("id", id)
    .single();

  if (convoError || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Get business credentials + stored QR URL
  const { data: biz } = await adminSupabase
    .from("businesses")
    .select("phone_number_id, access_token, qr_image_url")
    .eq("id", conversation.business_id)
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
    await adminSupabase
      .from("businesses")
      .update({ qr_image_url: imageUrl })
      .eq("id", conversation.business_id);
  }

  // Send QR image to customer via WhatsApp
  const waResult = await sendWhatsAppImage(
    conversation.phone,
    qrUrl,
    "Please scan this QR code to complete your advance payment 💳\n\nOnce paid, please reply with a screenshot of your payment so we can confirm it! 💛",
    { phoneNumberId: biz.phone_number_id, accessToken: biz.access_token }
  );

  if (waResult.error) {
    return Response.json({ error: waResult.error }, { status: 500 });
  }

  // Set payment_qr_sent = true so next image from customer is treated as payment
  await adminSupabase
    .from("conversations")
    .update({
      payment_qr_sent: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Log the QR send as a message
  await adminSupabase.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    content: "💳 QR Code sent for payment",
    media_url: qrUrl,
    media_type: "image",
  });

  return Response.json({ success: true, qrUrl });
}
