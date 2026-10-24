import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendWhatsAppImage, extractWamid } from "@/lib/whatsapp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy"
  );

  const { id } = await params;
  const body = await request.json();
  const { imageUrl, caption = "" } = body;

  if (!imageUrl) {
    return Response.json({ error: "imageUrl is required" }, { status: 400 });
  }

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

  // Get business credentials
  const { data: biz } = await adminSupabase
    .from("businesses")
    .select("phone_number_id, access_token")
    .eq("id", conversation.business_id)
    .single();

  if (!biz) {
    return Response.json({ error: "Business not found" }, { status: 404 });
  }

  // Send image to customer via WhatsApp
  const waResult = await sendWhatsAppImage(
    conversation.phone,
    imageUrl,
    caption,
    { phoneNumberId: biz.phone_number_id, accessToken: biz.access_token }
  );

  if (waResult.error) {
    return Response.json({ error: waResult.error }, { status: 500 });
  }

  // Log the message in DB so it shows in the dashboard
  await adminSupabase.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    source: "dashboard",
    whatsapp_msg_id: extractWamid(waResult),
    content: caption || "[Image]",
    media_url: imageUrl,
    media_type: "image",
  });

  // Update conversation timestamp
  await adminSupabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return Response.json({ success: true });
}
