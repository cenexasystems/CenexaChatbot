export type ContactCsvRow = { name: string; phone: string; tags: string[]; group: string; line: number };

export function normalizeContactPhone(raw: string, countryCode = "91"): string | null {
  let digits = raw.trim().replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && countryCode === "91") digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function parseContactsCsv(input: string, mapping: Partial<Record<"name" | "phone" | "tags" | "group", number>> = {}): { headers: string[]; rows: ContactCsvRow[] } {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) records.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) records.push(row); }
  const headers = (records.shift() ?? []).map((value) => value.trim().toLowerCase());
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const nameIndex = mapping.name ?? column("name", "full name", "customer", "contact");
  const phoneIndex = mapping.phone ?? column("phone", "phone number", "mobile", "mobile number", "whatsapp");
  const tagIndex = mapping.tags ?? column("tags", "tag", "labels", "label");
  const groupIndex = mapping.group ?? column("group", "group name", "list");
  if (phoneIndex < 0) throw new Error("CSV needs a phone or mobile column");
  const rows = records.map((values, i) => ({
    name: nameIndex < 0 ? "" : (values[nameIndex] ?? "").trim(),
    phone: (values[phoneIndex] ?? "").trim(),
    tags: tagIndex < 0 ? [] : (values[tagIndex] ?? "").split(/[;|]/).map((tag) => tag.trim()).filter(Boolean),
    group: groupIndex < 0 ? "" : (values[groupIndex] ?? "").trim(),
    line: i + 2,
  }));
  return { headers, rows };
}
