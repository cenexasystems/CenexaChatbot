import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { templateVariableCount } from "@/lib/templates";

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "campaign_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  const { data: template } = await access.admin.from("message_templates").select("name,language,category,body,status").eq("id", body.templateId).eq("business_id", access.businessId).maybeSingle();
  if (!template || template.status !== "approved") return Response.json({ error: "Choose an approved template" }, { status: 400 });
  if (template.category === "MARKETING") return Response.json({ error: "Marketing sends require recorded opt-in; use opted-in contacts" }, { status: 409 });
  const values = Array.isArray(body.variables) ? body.variables.filter((value: unknown): value is string => typeof value === "string") : [];
  if (values.length !== templateVariableCount(template.body)) return Response.json({ error: "Template variable count does not match" }, { status: 400 });
  const { data: business } = await access.admin.from("businesses").select("phone_number_id,access_token,whatsapp_number").eq("id", access.businessId).maybeSingle();
  if (!business?.whatsapp_number) return Response.json({ error: "Set an owner WhatsApp number before test sending" }, { status: 409 });
  const to = business.whatsapp_number.replace(/\D/g, "");
  const result = await sendWhatsAppTemplate(to, template.name, template.language, values, { phoneNumberId: business.phone_number_id, accessToken: business.access_token });
  const error = (result as { error?: { message?: string } } | null)?.error;
  if (error) return Response.json({ error: error.message ?? "Test send failed" }, { status: 502 });
  return Response.json({ ok: true, message: "Test template sent to the business number." });
}
