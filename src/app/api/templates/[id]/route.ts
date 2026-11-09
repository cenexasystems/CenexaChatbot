import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { GRAPH_BASE } from "@/lib/graph";
import { requireModuleEnabled } from "@/lib/module-access";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "templates_manage");
  if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "templates");
  if (disabled) return disabled;
  const { data: template, error: templateError } = await access.admin.from("message_templates").select("id, name, meta_template_id").eq("id", id).eq("business_id", access.businessId).maybeSingle();
  if (templateError) return Response.json({ error: "Unable to load template" }, { status: 500 });
  if (!template) return Response.json({ error: "Template not found" }, { status: 404 });
  if (template.meta_template_id) {
    const { data: meta } = await access.admin.from("businesses").select("waba_id, access_token").eq("id", access.businessId).maybeSingle();
    if (!meta?.waba_id) return Response.json({ error: "Reconnect WhatsApp before deleting this Meta template" }, { status: 409 });
    const deleted = await fetch(`${GRAPH_BASE}/${meta.waba_id}/message_templates?name=${encodeURIComponent(template.name)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${meta.access_token}` },
    });
    const result = await deleted.json().catch(() => ({}));
    if (!deleted.ok || result.error) return Response.json({ error: result.error?.message ?? "Meta could not delete this template" }, { status: 502 });
  }
  const { error } = await access.admin.from("message_templates").delete().eq("id", id).eq("business_id", access.businessId);
  if (error) return Response.json({ error: "Unable to remove template" }, { status: 500 });
  return Response.json({ ok: true });
}
