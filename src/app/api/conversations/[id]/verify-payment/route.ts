import { NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status, note } = body as { status?: string; note?: string };

  const validStatuses = ["none", "pending", "verified", "rejected"];
  if (!status || !validStatuses.includes(status)) {
    return Response.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  // Always use admin client (service role) so RLS never blocks these operations
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the conversation so we know who to notify
  const { data: conversation, error: convoError } = await adminSupabase
    .from("conversations")
    .select("phone, business_id")
    .eq("id", id)
    .single();

  if (convoError || !conversation) {
    console.error("verify-payment: conversation not found", convoError?.message);
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { payment_status: status };
  if (note !== undefined) update.internal_note = note;

  // Update the payment status in DB
  const { data, error } = await adminSupabase
    .from("conversations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("verify-payment: DB update failed", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Send WhatsApp confirmation message when verifying or rejecting
  if (status === "verified" || status === "rejected") {
    // Get business credentials
    const { data: biz, error: bizError } = await adminSupabase
      .from("businesses")
      .select("phone_number_id, access_token, name")
      .eq("id", conversation.business_id)
      .single();

    if (bizError || !biz) {
      console.error("verify-payment: could not fetch business credentials", bizError?.message, "business_id:", conversation.business_id);
    } else if (!biz.phone_number_id || !biz.access_token) {
      console.error("verify-payment: business has missing phone_number_id or access_token", biz);
    } else {
      const message =
        status === "verified"
          ? "✅ Your payment has been successfully verified! Thank you. We will process your order shortly."
          : "❌ We could not verify your payment. Please resend the correct payment screenshot or contact us for help.";

      // Send WhatsApp message to the customer
      const waResult = await sendWhatsAppMessage(conversation.phone, message, {
        phoneNumberId: biz.phone_number_id,
        accessToken: biz.access_token,
      });

      console.log("verify-payment: WhatsApp send result", JSON.stringify(waResult));

      // Log the confirmation message in the DB
      await adminSupabase.from("messages").insert({
        conversation_id: id,
        role: "assistant",
        content: message,
      });
    }
  }

  return Response.json(data);
}
