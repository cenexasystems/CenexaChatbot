import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

type ConsentStatus = "all" | "opted_in" | "opted_out" | "no_opt_in";
type ContactExportRow = {
  id: string;
  name: string | null;
  phone: string;
  source: string | null;
  opt_in_at: string | null;
  opt_in_source: string | null;
  opt_out_at: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "contacts");
  if (disabled) return disabled;
  const url = new URL(request.url);
  const exportCsv = url.searchParams.get("format") === "csv";
  if (exportCsv) {
    const denied = requirePermission(access, "contacts_manage");
    if (denied) return denied;
  }
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100).replace(/[(),]/g, " ");
  const tag = (url.searchParams.get("tag") ?? "").slice(0, 80);
  const groupId = url.searchParams.get("group");
  const cursor = url.searchParams.get("cursor");
  const rawStatus = url.searchParams.get("status") ?? "all";
  const status: ConsentStatus = ["all", "opted_in", "opted_out", "no_opt_in"].includes(rawStatus) ? rawStatus as ConsentStatus : "all";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  let groupContactIds: string[] | null = null;
  if (groupId) {
    const { data: group, error: groupError } = await access.admin.from("contact_groups").select("id").eq("id", groupId).eq("business_id", access.businessId).maybeSingle();
    if (groupError) return Response.json({ error: "Unable to load group" }, { status: 500 });
    if (!group) return Response.json({ error: "Group not found" }, { status: 404 });
    const { data: members, error: memberError } = await access.admin.from("contact_group_members").select("contact_id").eq("business_id", access.businessId).eq("group_id", groupId);
    if (memberError) return Response.json({ error: "Unable to load group members" }, { status: 500 });
    groupContactIds = (members ?? []).map((member) => member.contact_id);
    if (!groupContactIds.length) return exportCsv ? csvResponse() : Response.json({ contacts: [], nextCursor: null });
  }

  const buildQuery = (select: string, includeCursor = false) => {
    let query = access.admin.from("contacts").select(select).eq("business_id", access.businessId);
    const logicalFilters: string[] = [];
    if (q) {
      const digits = q.replace(/\D/g, "");
      logicalFilters.push(digits ? `or(name.ilike.%${q}%,phone.ilike.%${digits}%)` : `name.ilike.%${q}%`);
    }
    if (includeCursor && cursor) {
      const [updatedAt, id] = cursor.split("|");
      if (updatedAt && id && !Number.isNaN(Date.parse(updatedAt)) && /^[0-9a-f-]{36}$/i.test(id)) {
        logicalFilters.push(`or(updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id}))`);
      }
    }
    if (tag) query = query.contains("tags", [tag]);
    if (groupContactIds) query = query.in("id", groupContactIds);
    if (status === "opted_in") query = query.not("opt_in_at", "is", null).is("opt_out_at", null);
    if (status === "opted_out") query = query.not("opt_out_at", "is", null);
    if (status === "no_opt_in") query = query.is("opt_in_at", null).is("opt_out_at", null);
    if (logicalFilters.length === 1) query = query.or(logicalFilters[0]);
    if (logicalFilters.length > 1) query = query.or(`and(${logicalFilters.join(",")})`);
    return query;
  };

  if (exportCsv) {
    const columns = "name,phone,source,opt_in_at,opt_in_source,opt_out_at,tags,created_at,updated_at";
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`\uFEFF${csvRow(["name","phone","source","opt_in_at","opt_in_source","opt_out_at","tags","created_at","updated_at"])}\r\n`));
        void (async () => {
          try {
            for (let offset = 0; ; offset += 1000) {
              const { data, error } = await buildQuery(columns).order("created_at", { ascending: false }).range(offset, offset + 999);
              if (error) throw error;
              const rows = (data ?? []) as unknown as ContactExportRow[];
              if (!rows.length) break;
              const lines = rows.map((contact) => csvRow([contact.name,contact.phone,contact.source,contact.opt_in_at,contact.opt_in_source,contact.opt_out_at,(contact.tags ?? []).join("|"),contact.created_at,contact.updated_at]));
              controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
              if (rows.length < 1000) break;
            }
            controller.close();
          } catch {
            controller.error(new Error("Unable to complete contact export"));
          }
        })();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="chatflow-contacts-${status}.csv"`, "Cache-Control": "private, no-store" } });
  }

  const query = buildQuery("id, business_id, phone, name, source, opt_in_at, opt_in_source, opt_out_at, conversation_id, tags, created_at, updated_at", true).order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  const { data, error } = await query;
  if (error) return Response.json({ error: "Unable to load contacts" }, { status: 500 });
  const rows = (data ?? []) as unknown as ContactExportRow[];
  const contacts = rows.slice(0, limit);
  const last = contacts.at(-1);
  return Response.json({ contacts, nextCursor: rows.length > limit && last ? `${last.updated_at}|${last.id}` : null });
}

function csvRow(values: unknown[]): string {
  return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
}

function csvResponse() {
  return new Response("\uFEFFname,phone,source,opt_in_at,opt_in_source,opt_out_at,tags,created_at,updated_at\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="chatflow-contacts.csv"', "Cache-Control": "private, no-store" } });
}
