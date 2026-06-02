import { NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status, action, note } = body as { status?: string; action?: string; note?: string };

  const finalStatus = status || (action === "approve" ? "verified" : action === "reject" ? "rejected" : null);

  const validStatuses = ["none", "pending", "verified", "rejected"];
  if (!finalStatus || !validStatuses.includes(finalStatus)) {
    return Response.json({ error: "Invalid action or status" }, { status: 400 });
  }

  // Bypass RLS security using the Service Role Key
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const update: Record<string, unknown> = { payment_status: finalStatus };
  if (note !== undefined) update.internal_note = note;

  // Update conversation and fetch the business tokens to send the message
  const { data: conversation, error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", id)
    .select("id, phone, business_id, businesses(access_token, phone_number_id)")
    .single();

  if (error || !conversation) {
    return Response.json({ error: error?.message ?? "Failed to update conversation" }, { status: 500 });
  }

  // Determine what automated message to send based on the button clicked
  let replyMessage = "";
  if (finalStatus === "verified") {
    replyMessage = "✅ Your payment has been successfully verified! Thank you. We will process your order shortly.";
  } else if (finalStatus === "rejected") {
    replyMessage = "❌ We encountered an issue verifying your payment. Our team will contact you shortly to resolve this, or it will be refunded soon.";
  }

  // Send the WhatsApp message automatically
  if (replyMessage) {
    const biz = conversation.businesses as any;
    if (biz && biz.access_token && biz.phone_number_id) {
      try {
        await sendWhatsAppMessage(conversation.phone, replyMessage, {
          phoneNumberId: biz.phone_number_id,
          accessToken: biz.access_token,
        });

        // Save the message in the database so it appears in your dashboard chat
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: replyMessage,
        });

        // Update the 'last active' timestamp for the conversation
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversation.id);

      } catch (err) {
        console.error("Failed to send payment status message:", err);
      }
    }
  }

  return Response.json({ success: true, status: finalStatus });
}
