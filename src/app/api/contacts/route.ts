import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function GET(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "contacts");
  if (disabled) return disabled;
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    const denied = requirePermission(access, "contacts_manage");
    if (denied) return denied;
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = ["name","phone","source","opt_in_at","opt_in_source","opt_out_at","tags","created_at","updated_at"];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`\uFEFF${headers.map(escape).join(",")}\r\n`));
        void (async () => {
          try {
            for (let offset = 0; ; offset += 1000) {
              const { data, error } = await access.admin.from("contacts").select("name,phone,source,opt_in_at,opt_in_source,opt_out_at,tags,created_at,updated_at").eq("business_id", access.businessId).order("created_at", { ascending: false }).range(offset, offset + 999);
              if (error) throw error;
              const rows = data ?? [];
              if (!rows.length) break;
              const csv = rows.map((contact) => [contact.name,contact.phone,contact.source,contact.opt_in_at,contact.opt_in_source,contact.opt_out_at,(contact.tags??[]).join("|"),contact.created_at,contact.updated_at].map(escape).join(",")).join("\r\n");
              controller.enqueue(encoder.encode(`${csv}\r\n`));
              if (rows.length < 1000) break;
            }
            controller.close();
          } catch { controller.error(new Error("Unable to complete contact export")); }
        })();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="chatflow-contacts.csv"', "Cache-Control": "private, no-store" } });
  }
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100).replace(/[(),]/g, " ");
  const tag = url.searchParams.get("tag");
  const groupId = url.searchParams.get("group");
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  let query = access.admin.from("contacts").select("id, business_id, phone, name, source, opt_in_at, opt_in_source, opt_out_at, conversation_id, tags, created_at, updated_at").eq("business_id", access.businessId).order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (q) {
    const digits = q.replace(/\D/g, "");
    query = digits ? query.or(`name.ilike.%${q}%,phone.ilike.%${digits}%`) : query.ilike("name", `%${q}%`);
  }
  if (tag) query = query.contains("tags", [tag.slice(0, 80)]);
  if (cursor) {
    const [updatedAt, id] = cursor.split("|");
    if (updatedAt && id) query = query.or(`updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`);
  }
  if (groupId) {
    const { data: group, error: groupError } = await access.admin.from("contact_groups").select("id").eq("id", groupId).eq("business_id", access.businessId).maybeSingle();
    if (groupError) return Response.json({ error: "Unable to load group" }, { status: 500 });
    if (!group) return Response.json({ error: "Group not found" }, { status: 404 });
    const { data: members, error: memberError } = await access.admin.from("contact_group_members").select("contact_id").eq("business_id", access.businessId).eq("group_id", groupId);
    if (memberError) return Response.json({ error: "Unable to load group members" }, { status: 500 });
    const ids = (members ?? []).map((member) => member.contact_id);
    if (!ids.length) return Response.json({ contacts: [], nextCursor: null });
    query = query.in("id", ids);
  }
  const { data, error } = await query;
  if (error) return Response.json({ error: "Unable to load contacts" }, { status: 500 });
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const contacts = rows.slice(0, limit);
  const last = contacts.at(-1);
  return Response.json({ contacts, nextCursor: hasMore && last ? `${last.updated_at}|${last.id}` : null });
}
