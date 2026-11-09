import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeContactPhone, parseContactsCsv } from "../src/lib/contacts.ts";

test("normalizes India phone formats and keeps valid international numbers", () => {
  assert.equal(normalizeContactPhone("98765 43210"), "919876543210");
  assert.equal(normalizeContactPhone("09876543210"), "919876543210");
  assert.equal(normalizeContactPhone("+91 (98765) 43210"), "919876543210");
  assert.equal(normalizeContactPhone("00442071838750"), "442071838750");
  assert.equal(normalizeContactPhone("123"), null);
});

test("parses UTF-8 BOM, quoted commas, Tamil names, mapped columns, tags, and groups", () => {
  const input = '\uFEFFCustomer,Mobile,Labels,List\r\n"அம்மா, நகர்",09876543210,"lead; bridal","October Leads"\r\n';
  const parsed = parseContactsCsv(input);
  assert.deepEqual(parsed.headers, ["customer", "mobile", "labels", "list"]);
  assert.deepEqual(parsed.rows[0], { name: "அம்மா, நகர்", phone: "09876543210", tags: ["lead", "bridal"], group: "October Leads", line: 2 });
  const mapped = parseContactsCsv("Who,WhatsApp\nPriya,+919876543210", { name: 0, phone: 1 });
  assert.equal(mapped.rows[0].name, "Priya");
});

test("de-duplicates normalized phone numbers inside imported CSV rows", () => {
  const parsed = parseContactsCsv("name,phone\nA,9876543210\nB,+91 9876543210");
  const numbers = parsed.rows.map((row) => normalizeContactPhone(row.phone));
  assert.equal(new Set(numbers).size, 1);
});
