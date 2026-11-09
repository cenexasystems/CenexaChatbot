import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "campaign_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const { data: business } = await access.admin.from("businesses").select("campaign_sending_paused,modules_enabled").eq("id", access.businessId).maybeSingle();
  if (business?.campaign_sending_paused) return Response.json({ error: "Campaign sending is paused for this business" }, { status: 409 });
  const { data: campaign, error } = await access.admin.from("campaigns").select("id,status").eq("id", id).eq("business_id", access.businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load campaign" }, { status: 500 });
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") return Response.json({ error: "Only a draft campaign can be started" }, { status: 409 });
  const { error: updateError } = await access.admin.from("campaigns").update({ status: "sending", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", access.businessId);
  if (updateError) return Response.json({ error: "Could not start campaign" }, { status: 500 });
  return Response.json({ ok: true, queued: true });
}
