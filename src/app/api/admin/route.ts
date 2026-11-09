import { requirePlatformAccess } from "@/lib/platform-auth";

const TENANT_FIELDS = "id,name,plan,is_active,platform_suspended,whatsapp_number,phone_number_id,onboarding_type,coexistence_enabled,coexistence_synced_at,disconnected_reason,created_at,modules_enabled,media_ai_enabled,dashboard_v2_enabled,handoff_minutes,ai_model,vision_model,campaign_sending_paused,campaign_daily_send_cap";

export async function GET(request: Request) {
  const { access, response } = await requirePlatformAccess(); if (response) return response;
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100).replace(/[(),]/g, " ");
  const filter = params.get("filter");
  let query = access.admin.from("businesses").select(TENANT_FIELDS).order("created_at", { ascending: false }).limit(300);
  if (q) query = query.or(`name.ilike.%${q}%,whatsapp_number.ilike.%${q}%`);
  if (filter === "disconnected") query = query.eq("is_active", false);
  if (filter === "suspended") query = query.eq("platform_suspended", true);
  const callTenantSummary = access.admin.rpc as unknown as (name: string) => Promise<{ data: { business_id:string;last_customer_message_at:string|null;messages_30d:number;open_owner_alerts:number }[]|null; error: { message:string }|null }>;
  const [{ data: businesses, error }, { data: summaryRows, error: summaryError }] = await Promise.all([query, callTenantSummary("get_platform_tenant_summary")]);
  if (error || summaryError) return Response.json({ error: "Unable to load tenants" }, { status: 500 });
  const tenants = businesses ?? [];
  const summaries = new Map((summaryRows ?? []).map((row) => [row.business_id, row]));
  const enriched = tenants.map((business) => { const summary=summaries.get(business.id); return { ...business, last_customer_message_at:summary?.last_customer_message_at??null,messages_30d:summary?.messages_30d??0,open_owner_alerts:summary?.open_owner_alerts??0 }; });
  let visibleTenants = enriched;
  if (filter === "no_recent_traffic") {
    const cutoff = Date.now() - 30 * 86400000;
    visibleTenants = enriched.filter((row) => !row.last_customer_message_at || Date.parse(row.last_customer_message_at) < cutoff);
  }
  const byPlan = visibleTenants.reduce<Record<string, number>>((counts, row) => { counts[row.plan] = (counts[row.plan] ?? 0) + 1; return counts; }, {});
  const [{ data: sending }, { data: pendingTemplates }, { data: cron }, { data: recentAudit }] = await Promise.all([
    access.admin.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "sending"),
    access.admin.from("message_templates").select("id", { count: "exact", head: true }).eq("status", "pending"),
    access.admin.from("cron_runs").select("job,last_started_at,last_success_at,last_error,updated_at").order("job"),
    access.admin.from("platform_audit_log").select("id,actor_id,tenant_id,action,reason,created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const { data: usage } = await access.admin.from("tenant_usage_daily").select("usage_date,inbound_messages,ai_calls,ai_replies,team_replies,media_ai_analyses,template_sends,campaign_sends").order("usage_date", { ascending: false }).limit(5000);
  return Response.json({ tenants: visibleTenants, role: access.role, summary: { tenantCount: visibleTenants.length, activeCount: visibleTenants.filter((row) => !row.platform_suspended).length, byPlan, sendingCampaigns: sending?.length ?? 0, pendingTemplates: pendingTemplates?.length ?? 0, messagesByDay: aggregateUsage(usage ?? []) }, cron: cron ?? [], recentAudit: recentAudit ?? [] });
}

export async function PATCH(request: Request) {
  const { access, response } = await requirePlatformAccess({ write: true }); if (response) return response;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!body?.confirm || reason.length < 8) return Response.json({ error: "Confirm the change and provide a reason of at least 8 characters" }, { status: 400 });
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  if (!tenantId) return Response.json({ error: "Tenant id is required" }, { status: 400 });
  const fields = ["modules_enabled","platform_suspended","plan","coexistence_enabled","media_ai_enabled","dashboard_v2_enabled","handoff_minutes","ai_model","vision_model","campaign_sending_paused","campaign_daily_send_cap"] as const;
  const values = body.values && typeof body.values === "object" ? body.values as Record<string, unknown> : {};
  const update: Record<string, unknown> = {};
  for (const field of fields) if (Object.hasOwn(values, field)) update[field] = values[field];
  if (!Object.keys(update).length) return Response.json({ error: "No supported tenant settings provided" }, { status: 400 });
  const flagOnly = Object.keys(update).every((field) => field === "modules_enabled");
  if (!flagOnly && access.role !== "owner") return Response.json({ error: "Only platform owners can change plans or tenant state" }, { status: 403 });
  if ("plan" in update && !["basic","pro","enterprise"].includes(String(update.plan))) return Response.json({ error: "Invalid plan" }, { status: 400 });
  if ("platform_suspended" in update && typeof update.platform_suspended !== "boolean") return Response.json({ error: "Invalid suspension value" }, { status: 400 });
  for (const field of ["coexistence_enabled","media_ai_enabled","dashboard_v2_enabled","campaign_sending_paused"] as const) if (field in update && typeof update[field] !== "boolean") return Response.json({ error: `Invalid ${field} value` }, { status: 400 });
  for (const field of ["handoff_minutes","campaign_daily_send_cap"] as const) if (field in update && (!Number.isInteger(update[field]) || Number(update[field]) < 0 || Number(update[field]) > (field === "handoff_minutes" ? 1440 : 100000))) return Response.json({ error: `Invalid ${field} value` }, { status: 400 });
  for (const field of ["ai_model","vision_model"] as const) if (field in update && update[field] !== null && (typeof update[field] !== "string" || update[field].length > 160)) return Response.json({ error: `Invalid ${field} value` }, { status: 400 });
  if ("modules_enabled" in update) {
    if (!update.modules_enabled || typeof update.modules_enabled !== "object" || Array.isArray(update.modules_enabled)) return Response.json({ error: "Invalid module flags" }, { status: 400 });
    if (!Object.keys(update.modules_enabled as object).every((key) => ["templates","contacts","campaigns","automations","reports","team","integrations"].includes(key))) return Response.json({ error: "Unsupported module key" }, { status: 400 });
  }
  const callPlatformUpdate = access.admin.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { code: string; message: string } | null }>;
  const { data: tenant, error } = await callPlatformUpdate("platform_update_tenant", { p_tenant_id: tenantId, p_updates: update, p_actor_id: access.userId, p_reason: reason });
  if (error) return Response.json({ error: error.code === "P0002" ? "Tenant not found" : "Unable to update tenant" }, { status: error.code === "P0002" ? 404 : 500 });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });
  return Response.json({ tenant });
}
function aggregateUsage(rows: { usage_date: string; inbound_messages: number; ai_calls:number; ai_replies: number; team_replies: number; media_ai_analyses:number; template_sends:number; campaign_sends:number }[]) {
  const days = new Map<string, { inbound: number; aiCalls:number; ai: number; mediaAi:number; team: number; templates:number; campaigns:number }>();
  for (const row of rows) { const day = days.get(row.usage_date) ?? { inbound: 0, aiCalls:0, ai: 0, mediaAi:0, team: 0, templates:0, campaigns:0 }; day.inbound += row.inbound_messages; day.aiCalls += row.ai_calls; day.ai += row.ai_replies; day.mediaAi += row.media_ai_analyses; day.team += row.team_replies; day.templates += row.template_sends; day.campaigns += row.campaign_sends; days.set(row.usage_date, day); }
  return [...days.entries()].map(([date, values]) => ({ date, ...values })).sort((a, b) => a.date.localeCompare(b.date));
}
