import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCampaignCost, nextCampaignRecipientStatus, resolveCampaignAudience, shouldAutoPauseCampaign } from "../src/lib/campaigns.ts";
import { automationRunTime, automationSkipReason, isWithinQuietHours } from "../src/lib/automations.ts";

test("campaign audience requires recorded opt-in and excludes opted-out contacts", () => {
  const result = resolveCampaignAudience([
    { id: "a", phone: "919999000000", opt_in_at: "2026-11-01", opt_out_at: null },
    { id: "b", phone: "919999000001", opt_in_at: null, opt_out_at: null },
    { id: "c", phone: "919999000002", opt_in_at: "2026-11-01", opt_out_at: "2026-11-02" },
  ]);
  assert.deepEqual(result.eligible.map((item) => item.id), ["a"]);
  assert.deepEqual(result.skipped.map((item) => item.reason), ["Consent not recorded", "Contact opted out"]);
});

test("campaign cost estimate splits Meta rate and Cenexa fee; delivery never regresses", () => {
  assert.deepEqual(estimateCampaignCost(10, { country_code: "91", category: "MARKETING", rate_inr: 0.86, cenexa_fee_inr: 0.1, as_of: "2026-10-01" }), { recipientCount: 10, metaCostInr: 8.6, cenexaFeeInr: 1, totalInr: 9.6, currency: "INR", asOf: "2026-10-01" });
  assert.equal(nextCampaignRecipientStatus("read", "delivered"), "read");
  assert.equal(nextCampaignRecipientStatus("sent", "read"), "read");
  assert.equal(shouldAutoPauseCampaign(16, 4), true);
  assert.equal(shouldAutoPauseCampaign(10, 3), false);
});

test("automation quiet hours, clock injection, and stop reasons are deterministic", () => {
  const atQuiet = new Date("2026-11-09T17:00:00.000Z"); // 22:30 Asia/Kolkata
  assert.equal(isWithinQuietHours(atQuiet, { start: "21:00", end: "09:00" }), true);
  const due = automationRunTime(atQuiet, 0, { start: "21:00", end: "09:00" }, atQuiet);
  assert.equal(isWithinQuietHours(due, { start: "21:00", end: "09:00" }), false);
  assert.equal(automationSkipReason({ optedOut: true, withinWindow: true, hasApprovedTemplate: false, hasText: true, humanTakeover: false, customerReplied: false, paymentArrived: false }), "Contact opted out");
});
