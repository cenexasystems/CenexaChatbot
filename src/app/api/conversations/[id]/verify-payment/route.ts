import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess } from "@/lib/api-auth";
import { extractWamid, sendWhatsAppMessage } from "@/lib/whatsapp";
import { resolveOwnerAlertsForConversation } from "@/lib/owner-alerts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, admin: adminSupabase } = access;
  const body = await request.json();
  const { status, note } = body as { status?: string; note?: string };

  const validStatuses = ["none", "pending", "verified", "rejected"];
  if (!status || !validStatuses.includes(status)) {
    return Response.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const { conversation: rawConversation, error: convoError } = await getOwnedConversation(
    adminSupabase,
    businessId,
    id,
    "phone, business_id, name"
  );
  if (convoError) return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  if (!rawConversation) return conversationNotFound();
  const conversation = rawConversation as { phone: string; business_id: string; name: string | null };

  const update: Record<string, unknown> = { payment_status: status };
  if (note !== undefined) update.internal_note = note;

  // Update payment status using admin client
  const { data, error } = await adminSupabase
    .from("conversations")
    .update(update)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("verify-payment: DB update failed", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) return conversationNotFound();
  if (status === "verified" || status === "rejected" || status === "none") {
    await resolveOwnerAlertsForConversation(businessId, id, ["payment"]);
  }

  // Send WhatsApp notification for verify/reject
  let whatsapp_sent = false;
  let whatsapp_error: string | null = null;

  if (status === "verified" || status === "rejected") {
    // Fetch business credentials using admin client
    const { data: biz, error: bizError } = await adminSupabase
      .from("businesses")
      .select("phone_number_id, access_token, name")
      .eq("id", conversation.business_id)
      .single();

    if (bizError) {
      whatsapp_error = `Business fetch failed: ${bizError.message}`;
      console.error("verify-payment: business fetch error", bizError.message, "business_id:", conversation.business_id);
    } else if (!biz) {
      whatsapp_error = `No business found for id: ${conversation.business_id}`;
      console.error("verify-payment:", whatsapp_error);
    } else if (!biz.phone_number_id || !biz.access_token) {
      whatsapp_error = `Business '${biz.name}' is missing phone_number_id or access_token`;
      console.error("verify-payment:", whatsapp_error);
    } else {
      const message =
        status === "verified"
          ? "✅ Your payment has been successfully verified! Thank you. We will process your order shortly."
          : "❌ We could not verify your payment. Please resend the correct payment screenshot or contact us for help.";

      try {
        const waResult = await sendWhatsAppMessage(conversation.phone, message, {
          phoneNumberId: biz.phone_number_id,
          accessToken: biz.access_token,
        });

        console.log("verify-payment: WhatsApp API response", JSON.stringify(waResult));

        if (waResult?.error) {
          whatsapp_error = `WhatsApp API error: ${waResult.error.message} (code: ${waResult.error.code})`;
          console.error("verify-payment: WhatsApp send failed", whatsapp_error);
        } else if (waResult?.messages?.[0]?.id) {
          whatsapp_sent = true;
          console.log("verify-payment: WhatsApp message sent, id:", waResult.messages[0].id);

          // Log the message in DB
          await adminSupabase.from("messages").insert({
            conversation_id: id,
            role: "assistant",
            source: "dashboard",
            content: message,
            whatsapp_msg_id: extractWamid(waResult),
          });
        } else {
          whatsapp_error = `Unexpected WhatsApp response: ${JSON.stringify(waResult)}`;
          console.error("verify-payment:", whatsapp_error);
        }
      } catch (sendErr: unknown) {
        whatsapp_error = `WhatsApp send threw exception: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`;
        console.error("verify-payment:", whatsapp_error);
      }
    }
  }

  return Response.json({ ...data, whatsapp_sent, whatsapp_error });
}
