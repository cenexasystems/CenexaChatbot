import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

const TEAM_ROLES = ["admin", "support", "sales", "accounts"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "team_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "team"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  const { data: current } = await access.admin.from("profiles").select("id,role,status").eq("id", id).eq("business_id", access.businessId).maybeSingle();
  if (!current) return Response.json({ error: "Team member not found" }, { status: 404 });
  const role = body.role === undefined ? current.role : body.role;
  const status = body.status === undefined ? current.status : body.status;
  if (!TEAM_ROLES.includes(role) || !["invited", "active", "disabled"].includes(status)) return Response.json({ error: "Invalid team role or status" }, { status: 400 });
  if (current.status === "invited" && status === "active") return Response.json({ error: "The member becomes active after accepting the invitation" }, { status: 409 });
  const { data: updated, error } = await access.admin.rpc("update_team_profile", { p_business_id: access.businessId, p_target_id: id, p_role: role, p_status: status });
  if (error) return Response.json({ error: error.message.includes("at least one active admin") ? error.message : "Unable to update team member" }, { status: error.message.includes("at least one active admin") ? 409 : 500 });
  if (!updated) return Response.json({ error: "Team member not found" }, { status: 404 });
  if (status === "disabled" || (current.status === "disabled" && status === "active")) {
    const { error: authError } = await access.admin.auth.admin.updateUserById(id, { ban_duration: status === "disabled" ? "876000h" : "none" });
    if (authError && status === "disabled") return Response.json({ memberUpdated: true, warning: "The account is disabled in ChatFlow, but Supabase Auth could not be updated." }, { status: 200 });
    if (authError) return Response.json({ memberUpdated: true, warning: "The account is active in ChatFlow, but its Supabase Auth ban could not be removed." }, { status: 200 });
  }
  return Response.json({ memberUpdated: true });
}
