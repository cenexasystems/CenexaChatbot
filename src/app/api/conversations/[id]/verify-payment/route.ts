import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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
  const { status, note } = body as { status?: string; note?: string };

  const validStatuses = ["none", "pending", "verified", "rejected"];
  if (!status || !validStatuses.includes(status)) {
    return Response.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = { payment_status: status };
  if (note !== undefined) update.internal_note = note;

  const supabase = await createClient();

  // Get the conversation so we know who to notify
  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("phone, business_id")
    .eq("id", id)
    .single();

  if (convoError || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Update the payment status in DB
  const { data, error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Get business credentials to send the WhatsApp confirmation message
  const { data: biz } = await adminSupabase
    .from("businesses")
    .select("phone_number_id, access_token")
    .eq("id", conversation.business_id)
    .single();

  if (biz && (status === "verified" || status === "rejected")) {
    // Compose the message based on action
    const message =
      status === "verified"
        ? "✅ Your payment has been successfully verified! Thank you. We will process your order shortly."
        : "❌ We could not verify your payment. Please resend the correct payment screenshot or contact us for help.";

    // Send WhatsApp message to the customer
    await sendWhatsAppMessage(conversation.phone, message, {
      phoneNumberId: biz.phone_number_id,
      accessToken: biz.access_token,
    });

    // Log the confirmation message in the DB
    await adminSupabase.from("messages").insert({
      conversation_id: id,
      role: "assistant",
      content: message,
    });
  }

  return Response.json(data);
}
