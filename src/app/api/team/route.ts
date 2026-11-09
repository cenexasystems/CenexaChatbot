import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

const TEAM_ROLES = ["admin", "support", "sales", "accounts"] as const;

export async function GET() {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "team"); if (disabled) return disabled;
  const [{ data: members, error }, { data: business, error: businessError }] = await Promise.all([
    access.admin.from("profiles").select("id,name,email,role,status,invited_at,created_at").eq("business_id", access.businessId).order("created_at"),
    access.admin.from("businesses").select("strict_roles").eq("id", access.businessId).maybeSingle(),
  ]);
  if (error || businessError) return Response.json({ error: "Unable to load team" }, { status: 500 });
  return Response.json({ members: members ?? [], strictRoles: business?.strict_roles ?? false });
}

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "team_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "team"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const role = body.role as string;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || !TEAM_ROLES.includes(role as typeof TEAM_ROLES[number])) {
    return Response.json({ error: "Enter a valid email, name, and role" }, { status: 400 });
  }
  const emailPattern = email.replace(/[\\%_]/g, "\\$&");
  const { data: existing } = await access.admin.from("profiles").select("id,business_id").ilike("email", emailPattern).maybeSingle();
  if (existing) return Response.json({ error: existing.business_id === access.businessId ? "This person is already on your team" : "This account already belongs to another business" }, { status: 409 });

  const { data: invited, error: inviteError } = await access.admin.auth.admin.inviteUserByEmail(email, {
    data: { name, role },
    redirectTo: new URL("/auth/confirm", request.url).toString(),
  });
  if (inviteError || !invited.user) return Response.json({ error: inviteError?.message ?? "Could not send the invitation" }, { status: 409 });
  const { error: profileError } = await access.admin.from("profiles").insert({
    id: invited.user.id, business_id: access.businessId, name, email,
    role, status: "invited", invited_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  if (profileError) return Response.json({ error: "Invitation was sent, but the team profile could not be created. Ask an admin to retry after resolving the profile conflict." }, { status: 500 });
  return Response.json({ invited: { id: invited.user.id, email, name, role, status: "invited" } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "team_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "team"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  if (typeof body.strictRoles !== "boolean") return Response.json({ error: "strictRoles must be a boolean" }, { status: 400 });
  const { error } = await access.admin.from("businesses").update({ strict_roles: body.strictRoles }).eq("id", access.businessId);
  if (error) return Response.json({ error: "Unable to update strict role enforcement" }, { status: 500 });
  return Response.json({ strictRoles: body.strictRoles });
}
