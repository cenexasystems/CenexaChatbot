import { requireBusinessAccess } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { validateIntegrationLink } from "@/lib/integrations";

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const [{ data, error }, { data: business, error: businessError }] = await Promise.all([
    access.admin.from("integration_links").select("id,label,source_code,prefilled_text,created_at").eq("business_id", access.businessId).order("created_at", { ascending: false }),
    access.admin.from("businesses").select("whatsapp_number,modules_enabled").eq("id", access.businessId).maybeSingle(),
  ]);
  if (error || businessError) return Response.json({ error: "Unable to load integrations" }, { status: 500 });
  return Response.json({ links: data ?? [], phone: business?.whatsapp_number ?? null, modules: business?.modules_enabled ?? {} });
}

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  if (access.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "integrations");
  if (disabled) return disabled;
  try {
    const raw = await request.json();
    const input = validateIntegrationLink({ label: String(raw.label ?? ""), sourceCode: String(raw.sourceCode ?? ""), prefilledText: String(raw.prefilledText ?? "") });
    const { data, error } = await access.admin.from("integration_links").insert({ business_id: access.businessId, label: input.label, source_code: input.sourceCode, prefilled_text: input.prefilledText }).select("id,label,source_code,prefilled_text,created_at").single();
    if (error?.code === "23505") return Response.json({ error: "That source code is already in use" }, { status: 409 });
    if (error) return Response.json({ error: "Unable to save integration link" }, { status: 500 });
    return Response.json({ link: data }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid integration link" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  if (access.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "integrations");
  if (disabled) return disabled;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Link id is required" }, { status: 400 });
  const { data, error } = await access.admin.from("integration_links").delete().eq("business_id", access.businessId).eq("id", id).select("id").maybeSingle();
  if (error) return Response.json({ error: "Unable to delete integration link" }, { status: 500 });
  if (!data) return Response.json({ error: "Link not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  if (access.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json();
  if (typeof body.modules?.integrations !== "boolean") return Response.json({ error: "Invalid module setting" }, { status: 400 });
  const { data: business, error: readError } = await access.admin.from("businesses").select("modules_enabled").eq("id", access.businessId).maybeSingle();
  if (readError || !business) return Response.json({ error: "Unable to load business settings" }, { status: 500 });
  const { error } = await access.admin.from("businesses").update({ modules_enabled: { ...(business.modules_enabled ?? {}), integrations: body.modules.integrations } }).eq("id", access.businessId);
  if (error) return Response.json({ error: "Unable to update module setting" }, { status: 500 });
  return Response.json({ ok: true });
}
