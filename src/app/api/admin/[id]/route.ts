import { requirePlatformAccess } from "@/lib/platform-auth";
import { getPhoneCoexistenceStatus } from "@/lib/coexistence";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { access, response } = await requirePlatformAccess(); if (response) return response;
  const { id } = await params;
  const { data: tenant, error } = await access.admin.from("businesses").select("id,name,plan,is_active,platform_suspended,whatsapp_number,phone_number_id,waba_id,onboarding_type,coexistence_enabled,coexistence_synced_at,disconnected_reason,created_at,modules_enabled,media_ai_enabled,dashboard_v2_enabled,handoff_minutes,ai_model,vision_model,campaign_sending_paused,campaign_daily_send_cap").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: "Unable to load tenant" }, { status: 500 });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });
  const [profiles, audit, failures, recentMessages, openAlerts, connectionRow] = await Promise.all([
    access.admin.from("profiles").select("id,name,email,role,status,created_at").eq("business_id", id).order("created_at"),
    access.admin.from("platform_audit_log").select("id,actor_id,action,before_values,after_values,reason,created_at").eq("tenant_id", id).order("created_at", { ascending: false }).limit(50),
    access.admin.from("messages").select("delivery_error_code,conversations!inner(business_id)", { count: "exact" }).eq("conversations.business_id", id).eq("role", "assistant").eq("delivery_status", "failed").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).not("delivery_error_code", "is", null).limit(5000),
    access.admin.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", id).gte("updated_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    access.admin.from("owner_alerts").select("id", { count: "exact", head: true }).eq("business_id", id).is("resolved_at", null),
    access.admin.from("businesses").select("access_token,phone_number_id,is_active,onboarding_type,coexistence_enabled,coexistence_synced_at,disconnected_reason,whatsapp_number,name").eq("id", id).maybeSingle(),
  ]);
  if (profiles.error || audit.error || failures.error || recentMessages.error || openAlerts.error || connectionRow.error || !connectionRow.data) return Response.json({ error: "Unable to load tenant detail" }, { status: 500 });
  const business = connectionRow.data;
  let phoneLinked = Boolean(business.phone_number_id);
  if (business.is_active && business.onboarding_type === "coexistence" && business.access_token && business.phone_number_id) {
    const status = await getPhoneCoexistenceStatus(business.phone_number_id, business.access_token);
    phoneLinked = status.ok && status.isOnBizApp && status.platformType === "CLOUD_API";
  }
  const byError: Record<string, number> = {};
  for (const row of failures.data ?? []) { const code = row.delivery_error_code ?? "unknown"; byError[code] = (byError[code] ?? 0) + 1; }
  const [{ data: campaignCounts }, { data: templateCounts }] = await Promise.all([
    access.admin.from("campaigns").select("status", { count: "exact" }).eq("business_id", id),
    access.admin.from("message_templates").select("status", { count: "exact" }).eq("business_id", id),
  ]);
  return Response.json({ tenant, connection: { name: business.name, phoneNumber: business.whatsapp_number, active: business.is_active, onboardingType: business.onboarding_type, coexistenceEnabled: business.coexistence_enabled, syncedAt: business.coexistence_synced_at, disconnectedReason: business.disconnected_reason, phoneLinked }, users: profiles.data ?? [], audit: audit.data ?? [], failedSendsByCode: byError, conversations30d: recentMessages.count ?? 0, openOwnerAlerts: openAlerts.count ?? 0, campaignStatuses: groupCounts(campaignCounts ?? []), templateStatuses: groupCounts(templateCounts ?? []) });
}

function groupCounts(rows: { status: string }[]) { return rows.reduce<Record<string, number>>((result, row) => { result[row.status] = (result[row.status] ?? 0) + 1; return result; }, {}); }
