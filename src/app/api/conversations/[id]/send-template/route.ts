import { requireBusinessAccess, getOwnedConversation, conversationNotFound, requirePermission, requireStrictPermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { sendWhatsAppTemplate, extractWamid } from "@/lib/whatsapp";
import { resolveOwnerAlertsForConversation } from "@/lib/owner-alerts";
import { templateVariableCount } from "@/lib/templates";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "templates_send");
  if (denied) return denied;
  const replyDenied = requireStrictPermission(access, "conversation_reply"); if (replyDenied) return replyDenied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "templates");
  if (disabled) return disabled;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const bodyParameters = Array.isArray(body.bodyParameters) && body.bodyParameters.every((value) => typeof value === "string") ? body.bodyParameters as string[] : null;
  if (!templateId || !bodyParameters) return Response.json({ error: "Template and body parameters are required" }, { status: 400 });
  const { data: template, error: templateError } = await access.admin.from("message_templates").select("id, name, language, category, body, status").eq("id", templateId).eq("business_id", access.businessId).maybeSingle();
  if (templateError) return Response.json({ error: "Unable to load template" }, { status: 500 });
  if (!template) return Response.json({ error: "Template not found" }, { status: 404 });
  if (template.status !== "approved") return Response.json({ error: "Only approved templates can be sent" }, { status: 409 });
  if (template.category === "MARKETING") return Response.json({ error: "Marketing sends are unavailable until contact opt-in tracking is enabled" }, { status: 409 });
  const expected = templateVariableCount(template.body);
  if (expected < 0 || bodyParameters.length !== expected || bodyParameters.some((value) => !value.trim() || value.length > 1024)) {
    return Response.json({ error: `This template needs ${expected} body value${expected === 1 ? "" : "s"}` }, { status: 400 });
  }
  const { conversation, error: convoError } = await getOwnedConversation(access.admin, access.businessId, id, "phone, business_id");
  if (convoError) return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  if (!conversation) return conversationNotFound();
  const { data: business } = await access.admin.from("businesses").select("phone_number_id, access_token").eq("id", access.businessId).maybeSingle();
  if (!business?.phone_number_id || !business.access_token) return Response.json({ error: "WhatsApp is not connected" }, { status: 409 });
  const sent = await sendWhatsAppTemplate(
    String(conversation.phone), template.name, template.language, bodyParameters,
    { phoneNumberId: business.phone_number_id, accessToken: business.access_token }
  );
  const sendResult = sent as { error?: { message?: string } } | null;
  if (sendResult?.error) return Response.json({ error: sendResult.error.message ?? "WhatsApp could not send this template" }, { status: 502 });
  const rendered = template.body.replace(/\{\{(\d+)\}\}/g, (_match: string, number: string) => bodyParameters[Number(number) - 1] ?? "");
  const { data: message, error } = await access.admin.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    source: "template",
    content: rendered,
    whatsapp_msg_id: extractWamid(sent),
  }).select().single();
  if (error) return Response.json({ error: "WhatsApp sent the template but the chat history could not be saved" }, { status: 500 });
  await access.admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", access.businessId);
  await resolveOwnerAlertsForConversation(access.businessId, id, ["handoff"]);
  return Response.json(message);
}
