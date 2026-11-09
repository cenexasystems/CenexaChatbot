import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

const RULES = ["follow_up", "payment_reminder", "review_request", "dated_reminder"] as const;

export async function GET() {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "automations"); if (disabled) return disabled;
  await access.admin.from("automations").upsert(RULES.map((rule_type) => ({ business_id: access.businessId, rule_type, enabled: false, config: {} })), { onConflict: "business_id,rule_type", ignoreDuplicates: true });
  const [{ data: automations, error }, { data: runs, error: runError }] = await Promise.all([
    access.admin.from("automations").select("id,rule_type,enabled,config,updated_at").eq("business_id", access.businessId).order("rule_type"),
    access.admin.from("automation_runs").select("id,automation_id,contact_id,trigger_event_key,run_at,status,reason,attempts,created_at").eq("business_id", access.businessId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (error || runError) return Response.json({ error: "Unable to load automations" }, { status: 500 });
  return Response.json({ automations: automations ?? [], runs: runs ?? [] });
}

export async function PATCH(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "automation_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "automations"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.automations) || body.automations.length > RULES.length) return Response.json({ error: "Invalid rules" }, { status: 400 });
  const rows = [];
  for (const item of body.automations) {
    if (!RULES.includes(item.rule_type) || typeof item.enabled !== "boolean" || !item.config || typeof item.config !== "object") return Response.json({ error: "Invalid automation rule" }, { status: 400 });
    const config = item.config as Record<string, unknown>;
    const delay = Number(config.delay_minutes ?? 0);
    if (!Number.isInteger(delay) || delay < 5 || delay > 43_200) return Response.json({ error: "Delay must be between 5 minutes and 30 days" }, { status: 400 });
    if (typeof config.message === "string" && config.message.length > 1000) return Response.json({ error: "Message must be at most 1000 characters" }, { status: 400 });
    if (typeof config.template_id === "string" && config.template_id) {
      const { data: template } = await access.admin.from("message_templates").select("id,status").eq("id", config.template_id).eq("business_id", access.businessId).maybeSingle();
      if (!template || template.status !== "approved") return Response.json({ error: "Automation templates must be approved and owned by this business" }, { status: 400 });
    }
    rows.push({ business_id: access.businessId, rule_type: item.rule_type, enabled: item.enabled, config: { ...config, delay_minutes: delay, quiet_hours_start: config.quiet_hours_start ?? "21:00", quiet_hours_end: config.quiet_hours_end ?? "09:00" }, updated_at: new Date().toISOString() });
  }
  const { data, error } = await access.admin.from("automations").upsert(rows, { onConflict: "business_id,rule_type" }).select("id,rule_type,enabled,config");
  if (error) return Response.json({ error: "Unable to save automations" }, { status: 500 });
  return Response.json({ automations: data ?? [] });
}
