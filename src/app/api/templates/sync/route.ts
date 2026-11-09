import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { GRAPH_BASE } from "@/lib/graph";
import { requireModuleEnabled } from "@/lib/module-access";
import { mapMetaTemplateStatus } from "@/lib/templates";

type MetaComponent = { type?: string; format?: string; text?: string; buttons?: Array<Record<string, unknown>> };
type MetaTemplate = { id?: string; name?: string; language?: string; category?: string; status?: string; rejected_reason?: string; components?: MetaComponent[] };

export async function POST() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "templates_manage");
  if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "templates");
  if (disabled) return disabled;
  const { data: meta } = await access.admin.from("businesses").select("waba_id, access_token").eq("id", access.businessId).maybeSingle();
  if (!meta?.waba_id) return Response.json({ error: "Reconnect WhatsApp to sync message templates" }, { status: 409 });
  const params = new URLSearchParams({ fields: "id,name,language,category,status,rejected_reason,components", limit: "100" });
  const responseFromMeta = await fetch(`${GRAPH_BASE}/${meta.waba_id}/message_templates?${params}`, { headers: { Authorization: `Bearer ${meta.access_token}` } });
  const result = await responseFromMeta.json().catch(() => ({}));
  if (!responseFromMeta.ok || result.error) return Response.json({ error: result.error?.message ?? "Meta template sync failed" }, { status: 502 });
  const rows: Record<string, unknown>[] = [];
  for (const item of (result.data ?? []) as MetaTemplate[]) {
    if (!item.name || !item.language) continue;
    const components = item.components ?? [];
    const component = (type: string) => components.find((entry) => entry.type?.toUpperCase() === type);
    const header = component("HEADER");
    rows.push({
      business_id: access.businessId,
      name: item.name,
      language: item.language,
      category: item.category === "MARKETING" ? "MARKETING" : "UTILITY",
      header: header?.format === "TEXT" ? header.text ?? null : null,
      body: component("BODY")?.text ?? "",
      footer: component("FOOTER")?.text ?? null,
      buttons: component("BUTTONS")?.buttons ?? [],
      examples: [],
      status: mapMetaTemplateStatus(item.status),
      meta_template_id: item.id ?? null,
      rejection_reason: item.rejected_reason ?? null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    const { error } = await access.admin.from("message_templates").upsert(rows, { onConflict: "business_id,name,language" });
    if (error) return Response.json({ error: "Meta templates were fetched but could not be saved" }, { status: 500 });
  }
  return Response.json({ synced: rows.length });
}
