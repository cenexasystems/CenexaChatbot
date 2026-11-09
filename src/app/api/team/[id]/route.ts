import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

const TEAM_ROLES = ["admin", "support", "sales", "accounts"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "team_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "team"); if (disabled) return disabled;
  const { id } = await params;
  const { data: member, error: memberError } = await access.admin.from("profiles")
    .select("id,name,email,role,status")
    .eq("id", id).eq("business_id", access.businessId).maybeSingle();
  if (memberError) return Response.json({ error: "Unable to load team member" }, { status: 500 });
  if (!member) return Response.json({ error: "Team member not found" }, { status: 404 });
  if (member.status !== "invited") return Response.json({ error: "Only pending invitations can be resent" }, { status: 409 });
  if (!member.email || !TEAM_ROLES.includes(member.role as typeof TEAM_ROLES[number])) return Response.json({ error: "This invitation is missing a valid email or role" }, { status: 409 });

  const { data: invited, error: inviteError } = await access.admin.auth.admin.inviteUserByEmail(member.email, {
    data: { name: member.name, role: member.role },
    redirectTo: new URL("/auth/confirm", request.url).toString(),
  });
  if (inviteError || invited.user?.id !== id) {
    return Response.json({ error: inviteError?.message ?? "Could not resend this invitation" }, { status: 409 });
  }

  const { error: updateError } = await access.admin.from("profiles").update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).eq("business_id", access.businessId).eq("status", "invited");
  return Response.json({ resent: true, warning: updateError ? "The invite was sent, but its timestamp could not be updated." : undefined }, { status: 200 });
}

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
