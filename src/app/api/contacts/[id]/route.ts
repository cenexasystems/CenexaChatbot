import { requireBusinessAccess } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "contacts");
  if (disabled) return disabled;
  const { data: contact, error } = await access.admin.from("contacts").select("*").eq("id", id).eq("business_id", access.businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load contact" }, { status: 500 });
  if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 });
  const [{ data: activity, error: activityError }, { data: groups, error: groupsError }] = await Promise.all([
    access.admin.from("activity_events").select("id, event_type, details, created_at").eq("contact_id", id).eq("business_id", access.businessId).order("created_at", { ascending: false }).limit(200),
    access.admin.from("contact_group_members").select("group:contact_groups(id, name)").eq("contact_id", id).eq("business_id", access.businessId),
  ]);
  if (activityError || groupsError) return Response.json({ error: "Unable to load contact history" }, { status: 500 });
  let messages: unknown[] = [];
  if (contact.conversation_id) {
    const { data, error: messageError } = await access.admin.from("messages").select("id, role, source, content, media_type, created_at").eq("conversation_id", contact.conversation_id).order("created_at", { ascending: false }).limit(200);
    if (messageError) return Response.json({ error: "Unable to load contact messages" }, { status: 500 });
    messages = data ?? [];
  }
  return Response.json({ contact, activity: activity ?? [], groups: (groups ?? []).map((row) => row.group).filter(Boolean), messages });
}
