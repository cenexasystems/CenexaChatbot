import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { normalizeContactPhone, parseContactsCsv } from "@/lib/contacts";

const CHUNK_SIZE = 250;

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "contacts_manage");
  if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "contacts");
  if (disabled) return disabled;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentImports, error: rateError } = await access.admin.from("activity_events").select("id", { count: "exact", head: true }).eq("business_id", access.businessId).eq("event_type", "csv_import_attempt").contains("details", { user_id: access.userId }).gte("created_at", since);
  if (rateError) return Response.json({ error: "Unable to check import rate limit" }, { status: 500 });
  if ((recentImports ?? 0) >= 5) return Response.json({ error: "Import limit reached. Try again later." }, { status: 429 });
  const { error: logError } = await access.admin.from("activity_events").insert({ business_id: access.businessId, event_type: "csv_import_attempt", details: { user_id: access.userId } });
  if (logError) return Response.json({ error: "Unable to record import attempt" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  if (body.consentConfirmed !== true) return Response.json({ error: "Confirm that every imported contact opted in to WhatsApp messages" }, { status: 400 });
  if (typeof body.csv !== "string" || body.csv.length > 5_000_000) return Response.json({ error: "Upload a CSV file up to 5 MB" }, { status: 400 });
  let parsed: ReturnType<typeof parseContactsCsv>;
  const mapping = body.mapping && typeof body.mapping === "object" ? body.mapping : {};
  try { parsed = parseContactsCsv(body.csv, mapping); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  if (!parsed.rows.length) return Response.json({ error: "CSV has no contact rows" }, { status: 400 });
  if (parsed.rows.length > 5000) return Response.json({ error: "A single import is limited to 5,000 rows" }, { status: 413 });
  const skipped: Array<{ line: number; phone: string; reason: string }> = [];
  const seen = new Set<string>();
  const candidates: Array<{ phone: string; name: string | null; tags: string[]; group: string; line: number }> = [];
  for (const row of parsed.rows) {
    const phone = normalizeContactPhone(row.phone);
    if (!phone) { skipped.push({ line: row.line, phone: row.phone, reason: "Invalid phone number" }); continue; }
    if (seen.has(phone)) { skipped.push({ line: row.line, phone: row.phone, reason: "Duplicate phone in CSV" }); continue; }
    seen.add(phone);
    candidates.push({ phone, name: row.name || null, tags: row.tags, group: row.group, line: row.line });
  }
  const existing = new Set<string>();
  for (let offset = 0; offset < candidates.length; offset += CHUNK_SIZE) {
    const chunk = candidates.slice(offset, offset + CHUNK_SIZE);
    const { data, error } = await access.admin.from("contacts").select("phone").eq("business_id", access.businessId).in("phone", chunk.map((item) => item.phone));
    if (error) return Response.json({ error: "Unable to check existing contacts" }, { status: 500 });
    for (const item of data ?? []) existing.add(item.phone);
  }
  const fresh = candidates.filter((item) => {
    if (!existing.has(item.phone)) return true;
    skipped.push({ line: item.line, phone: item.phone, reason: "Already exists in this business" });
    return false;
  });
  const timestamp = new Date().toISOString();
  const imported: Array<{ id: string; phone: string; group: string }> = [];
  for (let offset = 0; offset < fresh.length; offset += CHUNK_SIZE) {
    const chunk = fresh.slice(offset, offset + CHUNK_SIZE);
    const { data, error } = await access.admin.from("contacts").insert(chunk.map((item) => ({
      business_id: access.businessId,
      phone: item.phone,
      name: item.name,
      tags: item.tags,
      source: "csv_import",
      opt_in_at: timestamp,
      opt_in_source: typeof body.consentSource === "string" && body.consentSource.trim() ? body.consentSource.trim().slice(0, 160) : "CSV import; owner confirmed opt-in",
    }))).select("id, phone");
    if (error) return Response.json({ error: "Import stopped while saving contacts", imported: imported.length }, { status: 500 });
    for (const item of data ?? []) {
      const source = chunk.find((entry) => entry.phone === item.phone);
      imported.push({ id: item.id, phone: item.phone, group: source?.group ?? "" });
    }
  }
  const groupNames = [...new Set(imported.map((item) => item.group).filter(Boolean))];
  const groupsByName = new Map<string, string>();
  for (const name of groupNames) {
    const { data, error } = await access.admin.from("contact_groups").upsert({ business_id: access.businessId, name }, { onConflict: "business_id,name" }).select("id, name").single();
    if (error) return Response.json({ error: "Contacts imported, but a group could not be saved", imported: imported.length }, { status: 500 });
    groupsByName.set(name, data.id);
  }
  for (const name of groupNames) {
    const groupId = groupsByName.get(name)!;
    const contactIds = imported.filter((item) => item.group === name).map((item) => item.id);
    for (let offset = 0; offset < contactIds.length; offset += CHUNK_SIZE) {
      const { error } = await access.admin.from("contact_group_members").upsert(contactIds.slice(offset, offset + CHUNK_SIZE).map((contactId) => ({ business_id: access.businessId, group_id: groupId, contact_id: contactId })), { onConflict: "group_id,contact_id", ignoreDuplicates: true });
      if (error) return Response.json({ error: "Contacts imported, but group membership could not be saved", imported: imported.length }, { status: 500 });
    }
  }
  return Response.json({ imported: imported.length, skipped: skipped.length, skippedRows: skipped });
}
