import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess, requireStrictPermission } from "@/lib/api-auth";
import { extractWamid, sendWhatsAppMessage } from "@/lib/whatsapp";
import { resolveOwnerAlertsForConversation } from "@/lib/owner-alerts";
import { recordContactActivity } from "@/lib/activity";
import { enqueueAutomationForConversation, cancelAutomationForConversation } from "@/lib/automation-queue";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requireStrictPermission(access, "payment_verify"); if (denied) return denied;
  const { businessId, admin: adminSupabase } = access;
  const body = await request.json();
  const { status, note, amount } = body as { status?: string; note?: string; amount?: number | string | null };

  const validStatuses = ["none", "pending", "verified", "rejected"];
  if (!status || !validStatuses.includes(status)) {
    return Response.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }
  const parsedAmount = amount === undefined || amount === null || amount === "" ? null : Number(amount);
  if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > 1_000_000_000)) {
    return Response.json({ error: "Amount must be a valid non-negative number" }, { status: 400 });
  }
  if (parsedAmount !== null && status !== "verified") return Response.json({ error: "An amount can only be recorded when verifying a payment" }, { status: 400 });

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
  if (status === "verified") update.payment_amount = parsedAmount;
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
  await recordContactActivity(adminSupabase, businessId, id, `payment_${status}`, { amount: parsedAmount });
  if (status === "verified") {
    await cancelAutomationForConversation(businessId, id, "Payment arrived");
    await enqueueAutomationForConversation(businessId, id, "review_request", `payment-verified:${id}:${Date.now()}`);
    const { data: flags } = await adminSupabase.from("businesses").select("modules_enabled").eq("id", businessId).maybeSingle();
    if (flags?.modules_enabled?.campaigns === true) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const { data: recipient } = await adminSupabase.from("campaign_recipients").select("id,campaign_id,contact_id,status").eq("business_id", businessId).eq("phone", conversation.phone).gte("sent_at", since).in("status", ["sent", "delivered", "read", "replied"]).order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (recipient) {
        await adminSupabase.from("campaign_recipients").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", recipient.id).eq("business_id", businessId);
        await adminSupabase.from("activity_events").insert({ business_id: businessId, contact_id: recipient.contact_id, conversation_id: id, event_type: "campaign_paid", details: { campaign_id: recipient.campaign_id, attribution: "within 7 days" } });
      }
    }
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
