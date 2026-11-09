import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "contacts");
  if (disabled) return disabled;
  const { data, error } = await access.admin.from("contact_groups").select("id, name, created_at").eq("business_id", access.businessId).order("name");
  if (error) return Response.json({ error: "Unable to load groups" }, { status: 500 });
  return Response.json({ groups: data ?? [] });
}

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "contacts_manage");
  if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "contacts");
  if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) return Response.json({ error: "Group name must be 1–80 characters" }, { status: 400 });
  const { data, error } = await access.admin.from("contact_groups").insert({ business_id: access.businessId, name }).select("id, name, created_at").single();
  if (error?.code === "23505") return Response.json({ error: "A group with this name already exists" }, { status: 409 });
  if (error) return Response.json({ error: "Could not create group" }, { status: 500 });
  return Response.json({ group: data }, { status: 201 });
}
