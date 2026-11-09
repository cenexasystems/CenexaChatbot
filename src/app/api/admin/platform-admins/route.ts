import { requirePlatformAccess } from "@/lib/platform-auth";

export async function GET() {
  const { access, response } = await requirePlatformAccess(); if (response) return response;
  if (access.role !== "owner") return Response.json({ error: "Platform owner access required" }, { status: 403 });
  const { data, error } = await access.admin.from("platform_admins").select("user_id,role,disabled,created_at,updated_at").order("created_at");
  if (error) return Response.json({ error: "Unable to load platform admins" }, { status: 500 });
  return Response.json({ admins: data ?? [] });
}

export async function POST(request: Request) {
  const { access, response } = await requirePlatformAccess({ write: true }); if (response) return response;
  if (access.role !== "owner") return Response.json({ error: "Platform owner access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const role = body?.role;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!body?.confirm || reason.length < 8 || !userId || !["owner","support","read_only"].includes(role)) return Response.json({ error: "Confirmed user id, role, and reason are required" }, { status: 400 });
  const callPlatformAdmin = access.admin.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { code: string; message: string } | null }>;
  const { data: target, error } = await callPlatformAdmin("platform_set_admin", { p_user_id: userId, p_role: role, p_disabled: Boolean(body.disabled), p_actor_id: access.userId, p_reason: reason });
  if (error) return Response.json({ error: "Unable to save platform admin" }, { status: 500 });
  return Response.json({ admin: target });
}
