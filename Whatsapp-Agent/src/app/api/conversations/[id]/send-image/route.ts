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
  const { imageUrl, caption } = body;

  if (!imageUrl) {
    return Response.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("phone, business_id")
    .eq("id", id)
    .single();

  if (convoError || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

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

  const waResult = await sendWhatsAppImage(
    conversation.phone,
    imageUrl,
    caption ?? "",
    { phoneNumberId, accessToken }
  );

  if (waResult.error) {
    return Response.json({ error: waResult.error }, { status: 500 });
  }

  const { data: msg, error: msgError } = await adminSupabase
    .from("messages")
    .insert({
      conversation_id: id,
      role: "assistant",
      content: caption ? `[Image] ${caption}` : "[Image sent]",
      media_url: imageUrl,
    })
    .select()
    .single();

  if (msgError) {
    console.error("DB insert error:", msgError.message);
    return Response.json({ success: true, warning: msgError.message });
  }

  await adminSupabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return Response.json(msg);
}
