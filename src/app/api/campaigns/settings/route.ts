import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function GET() {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const { data, error } = await access.admin.from("businesses").select("campaign_sending_paused,campaign_daily_send_cap").eq("id", access.businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load campaign settings" }, { status: 500 });
  return Response.json({ settings: data });
}

export async function PATCH(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "campaign_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  if (typeof body.paused !== "boolean") return Response.json({ error: "paused must be a boolean" }, { status: 400 });
  const { error } = await access.admin.from("businesses").update({ campaign_sending_paused: body.paused }).eq("id", access.businessId);
  if (error) return Response.json({ error: "Unable to change campaign sending pause" }, { status: 500 });
  return Response.json({ campaign_sending_paused: body.paused });
}
