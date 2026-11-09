import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "assistant_settings");
  if (denied) return denied;
  const { id } = await params;
  const { data, error } = await access.admin.from("assistant_knowledge_files").delete()
    .eq("id", id).eq("business_id", access.businessId).select("id").maybeSingle();
  if (error) return Response.json({ error: "Unable to delete knowledge file" }, { status: 500 });
  if (!data) return Response.json({ error: "Knowledge file not found" }, { status: 404 });
  return Response.json({ success: true });
}
