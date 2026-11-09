import { test } from "node:test";
import assert from "node:assert/strict";
import { dateInTimezone, reportRowsToCsv, validReportRange } from "../src/lib/reports.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("report dates use the business timezone across Asia/Kolkata midnight", () => {
  assert.equal(dateInTimezone(new Date("2026-11-08T18:29:59.000Z"), "Asia/Kolkata"), "2026-11-08");
  assert.equal(dateInTimezone(new Date("2026-11-08T18:30:00.000Z"), "Asia/Kolkata"), "2026-11-09");
  assert.equal(validReportRange("2026-11-09", "2026-11-09"), true);
  assert.equal(validReportRange("2026-02-30", "2026-03-01"), false);
  assert.equal(validReportRange("2026-01-01", "2027-01-03"), false);
});

test("report CSV preserves embedded commas, quotes, newlines, and UTF-8 BOM", () => {
  const csv = reportRowsToCsv([{ report_date: "2026-11-09", metric: "sales_inr", dimension: "verified, paid", value: 1250, period_total: 1250 }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /"verified, paid"/);
  assert.match(csv, /2026-11-09,sales_inr/);
});

test("reports and team APIs keep business scope and role checks on the server", () => {
  const reports = readFileSync(resolve("src/app/api/reports/route.ts"), "utf8");
  const team = readFileSync(resolve("src/app/api/team/route.ts"), "utf8");
  const member = readFileSync(resolve("src/app/api/team/[id]/route.ts"), "utf8");
  const migration = readFileSync(resolve("supabase/migrations/20261109_reports_team.sql"), "utf8");
  assert.match(reports, /requireBusinessAccess\(/);
  assert.match(reports, /requirePermission\(access, "reports_view"\)/);
  assert.match(reports, /p_business_id: access\.businessId/);
  assert.match(team, /requirePermission\(access, "team_manage"\)/);
  assert.match(team, /eq\("business_id", access\.businessId\)/);
  assert.match(member, /p_business_id: access\.businessId/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /at least one active admin/);
  assert.match(migration, /revoke all on function public\.get_business_report_series/);
  assert.match(migration, /profile_read_self.*status = 'active'/s);
});
