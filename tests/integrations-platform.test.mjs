import test from "node:test";
import assert from "node:assert/strict";
import { buildClickToChatUrl, normalizeSourceCode, parseClickToChatSource, validateIntegrationLink } from "../src/lib/integrations.ts";
import { platformRoleCan } from "../src/lib/platform-permissions.ts";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";
import { senderOf } from "../src/lib/inbox.ts";
import { decryptGoogleToken, encryptGoogleToken, googleSpreadsheetId } from "../src/lib/google-sheets.ts";

test("tracked WhatsApp links encode phone text and source reliably", () => {
  const message = "வணக்கம், I saw your shop";
  const url = buildClickToChatUrl("+91 98765 43210", message, "Instagram Story");
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/919876543210");
  assert.equal(parsed.searchParams.get("text"), `${message}\n\nSource: instagram-story`);
  assert.equal(parseClickToChatSource(parsed.searchParams.get("text")), "instagram-story");
});

test("source matching tolerates case and whitespace but ignores edited or unknown values", () => {
  assert.equal(parseClickToChatSource("Hello\n source : WEBSITE "), "website");
  assert.equal(parseClickToChatSource("Hello, source website"), null);
  assert.equal(parseClickToChatSource("Hello\nSource: custom-code"), "custom-code");
  assert.equal(normalizeSourceCode("  தமிழ் Store! "), "store");
});

test("integration link validation rejects empty fields and normalizes codes", () => {
  assert.deepEqual(validateIntegrationLink({ label: " Site ", sourceCode: "My Site!", prefilledText: " Hi " }), { label: "Site", sourceCode: "my-site", prefilledText: "Hi" });
  assert.throws(() => validateIntegrationLink({ label: "", sourceCode: "", prefilledText: "" }));
  assert.throws(() => buildClickToChatUrl("123", "Hi", "site"));
});

test("Google Sheets accepts spreadsheet URLs or IDs and encrypts OAuth refresh tokens", () => {
  const id = "aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890";
  assert.equal(googleSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  assert.equal(googleSpreadsheetId(id), id);
  assert.equal(googleSpreadsheetId("https://example.com/not-a-sheet"), null);
  const previousKey = process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY;
  process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const encrypted = encryptGoogleToken("refresh-token-test");
    assert.notEqual(encrypted, "refresh-token-test");
    assert.equal(decryptGoogleToken(encrypted), "refresh-token-test");
    const parts = encrypted.split(".");
    parts[1] = `${parts[1][0] === "A" ? "B" : "A"}${parts[1].slice(1)}`;
    assert.throws(() => decryptGoogleToken(parts.join(".")));
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY;
    else process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY = previousKey;
  }
});

test("Google Sheets OAuth is state-protected and the token table is tenant-scoped", () => {
  const connect = readFileSync("src/app/api/integrations/google/connect/route.ts", "utf8");
  const callback = readFileSync("src/app/api/integrations/google/callback/route.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20261112_google_sheets_sync.sql", "utf8");
  assert.match(connect, /randomBytes\(32\)/);
  assert.match(callback, /url\.searchParams\.get\("state"\) !== expectedState/);
  assert.match(callback, /encryptGoogleToken\(token\.refresh_token\)/);
  assert.match(migration, /business_id uuid primary key references public\.businesses/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /for update skip locked/);
});

test("generated click-to-chat QR is a locally encoded SVG", async () => {
  const value = await QRCode.toString(buildClickToChatUrl("919876543210", "வணக்கம்", "website"), { type: "svg", errorCorrectionLevel: "M" });
  assert.match(value, /^<svg/);
  assert.match(value, /<path/);
});

test("platform permissions separate owner, support, and read-only", () => {
  assert.equal(platformRoleCan("owner", "manage_admins"), true);
  assert.equal(platformRoleCan("support", "tenant_flags"), true);
  assert.equal(platformRoleCan("support", "tenant_controls"), false);
  assert.equal(platformRoleCan("read_only", "tenant_flags"), false);
});

test("template sends display as team messages in the inbox", () => {
  assert.equal(senderOf({ role: "assistant", source: "template" }), "team");
});

test("webhook attribution is gated by the integrations flag and tenant link lookup", () => {
  const webhook = readFileSync("src/app/api/webhook/route.ts", "utf8");
  assert.match(webhook, /biz\.modules_enabled\?\.integrations === true \? parseClickToChatSource\(text\) : null/);
  assert.match(webhook, /\.eq\("business_id", businessId\)\.eq\("source_code", attributedCode\)/);
});

test("admin routes require platform guards and tenant detail avoids customer message content", () => {
  for (const route of ["src/app/api/admin/route.ts", "src/app/api/admin/[id]/route.ts", "src/app/api/admin/platform-admins/route.ts"]) {
    const code = readFileSync(route, "utf8");
    assert.match(code, /requirePlatformAccess/);
    assert.doesNotMatch(code, /\.select\("\*"\)/);
  }
  const detail = readFileSync("src/app/api/admin/[id]/route.ts", "utf8");
  assert.doesNotMatch(detail, /select\([^\n]*content/);
  assert.match(detail, /delivery_error_code/);
});

test("platform migration protects append-only audit and separates platform identities", () => {
  const sql = readFileSync("supabase/migrations/20261109_platform_admin.sql", "utf8");
  assert.match(sql, /create table if not exists public\.platform_admins/);
  assert.match(sql, /create table if not exists public\.platform_audit_log/);
  assert.match(sql, /before update or delete on public\.platform_audit_log/);
  assert.match(sql, /revoke all on function public\.platform_update_tenant/);
});
