import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRAPH_BASE } from "@/lib/graph";
import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { buildMetaTemplatePayload, validateTemplateDraft } from "@/lib/templates";

type BusinessMeta = { waba_id: string | null; access_token: string };

async function getMetaBusiness(admin: SupabaseClient, businessId: string): Promise<BusinessMeta | null> {
  const { data } = await admin.from("businesses").select("waba_id, access_token").eq("id", businessId).maybeSingle();
  return data as BusinessMeta | null;
}

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "templates");
  if (disabled) return disabled;
  const { data, error } = await access.admin.from("message_templates").select("*").eq("business_id", access.businessId).order("updated_at", { ascending: false });
  if (error) return Response.json({ error: "Unable to load templates" }, { status: 500 });
  const meta = await getMetaBusiness(access.admin, access.businessId);
  return Response.json({ templates: data ?? [], wabaConfigured: Boolean(meta?.waba_id) });
}

export async function POST(request: NextRequest) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "templates_manage");
  if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "templates");
  if (disabled) return disabled;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const checked = validateTemplateDraft(record.template);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  const draft = checked.value;
  const submit = record.submit === true;
  const { data: existing, error: existingError } = await access.admin.from("message_templates").select("id, status").eq("business_id", access.businessId).eq("name", draft.name).eq("language", draft.language).maybeSingle();
  if (existingError) return Response.json({ error: "Unable to check existing templates" }, { status: 500 });
  if (existing && existing.status !== "draft") return Response.json({ error: "This name and language already has a Meta template. Sync its status before replacing it." }, { status: 409 });
  let status = "draft";
  let metaTemplateId: string | null = null;
  const rejectionReason: string | null = null;

  if (submit) {
    const meta = await getMetaBusiness(access.admin, access.businessId);
    if (!meta?.waba_id) return Response.json({ error: "Reconnect WhatsApp to submit templates for approval" }, { status: 409 });
    const graphResponse = await fetch(`${GRAPH_BASE}/${meta.waba_id}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${meta.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildMetaTemplatePayload(draft)),
    });
    const graphData = await graphResponse.json().catch(() => ({}));
    if (!graphResponse.ok || graphData.error) {
      return Response.json({ error: graphData.error?.message ?? "Meta could not submit this template" }, { status: 502 });
    }
    status = "pending";
    metaTemplateId = typeof graphData.id === "string" ? graphData.id : null;
  }

  const { data, error } = await access.admin.from("message_templates").upsert({
    business_id: access.businessId,
    name: draft.name,
    language: draft.language,
    category: draft.category,
    header: draft.header,
    body: draft.body,
    footer: draft.footer,
    buttons: draft.buttons ?? [],
    examples: draft.examples ?? [],
    status,
    meta_template_id: metaTemplateId,
    rejection_reason: rejectionReason,
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id,name,language" }).select("*").single();
  if (error) return Response.json({ error: "Unable to save template" }, { status: 500 });
  return Response.json({ template: data }, { status: submit ? 201 : 200 });
}
