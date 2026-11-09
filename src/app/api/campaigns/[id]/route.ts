import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const { data: campaign, error } = await access.admin.from("campaigns").select("*").eq("id", id).eq("business_id", access.businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load campaign" }, { status: 500 });
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const { data: recipients } = await access.admin.from("campaign_recipients").select("id,phone,status,skip_reason,error_code,sent_at,delivered_at,read_at,replied_at,paid_at").eq("campaign_id", id).eq("business_id", access.businessId).order("created_at").limit(5000);
  const counts = Object.fromEntries(["queued","sent","delivered","read","replied","paid","failed","skipped"].map((status) => [status, (recipients ?? []).filter((row) => row.status === status).length]));
  return Response.json({ campaign, recipients: recipients ?? [], counts });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "campaign_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const { data: campaign } = await access.admin.from("campaigns").select("id,status").eq("id", id).eq("business_id", access.businessId).maybeSingle();
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (action === "pause" && campaign.status === "sending") {
    await access.admin.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", access.businessId);
  } else if (action === "resume" && campaign.status === "paused") {
    await access.admin.from("campaigns").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", access.businessId);
  } else if (action === "cancel" && ["draft", "scheduled", "sending", "paused"].includes(campaign.status)) {
    await access.admin.from("campaigns").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", access.businessId);
    await access.admin.from("campaign_recipients").update({ status: "skipped", skip_reason: "Campaign cancelled", locked_at: null }).eq("campaign_id", id).eq("status", "queued");
  } else return Response.json({ error: "Action not valid for this campaign" }, { status: 409 });
  return Response.json({ ok: true });
}
