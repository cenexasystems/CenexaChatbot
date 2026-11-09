import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMetaTemplatePayload, mapMetaTemplateStatus, templateVariableCount, validateTemplateDraft } from "../src/lib/templates.ts";
import { requirePermission } from "../src/lib/permissions.ts";

const base = { name: "appointment_reminder", language: "en", category: "UTILITY", body: "Hi {{1}}, your appointment is {{2}}.", examples: ["Priya", "Monday"] };

test("template names and body variables are validated", () => {
  assert.equal(validateTemplateDraft(base).ok, true);
  assert.equal(validateTemplateDraft({ ...base, name: "Appointment Reminder" }).ok, false);
  assert.equal(validateTemplateDraft({ ...base, body: "Hello {{2}}", examples: ["x"] }).ok, false);
  assert.equal(templateVariableCount("Hello {{1}}, order {{2}}"), 2);
  assert.equal(templateVariableCount("Hello {{2}}"), -1);
});

test("Meta payload includes supported text components and example values", () => {
  const checked = validateTemplateDraft({ ...base, header: "Reminder", footer: "Thank you", buttons: [{ type: "QUICK_REPLY", text: "Confirm" }] });
  assert.equal(checked.ok, true);
  const payload = buildMetaTemplatePayload(checked.value);
  assert.deepEqual(payload, {
    name: "appointment_reminder", language: "en", category: "UTILITY",
    components: [
      { type: "HEADER", format: "TEXT", text: "Reminder" },
      { type: "BODY", text: base.body, example: { body_text: [["Priya", "Monday"]] } },
      { type: "FOOTER", text: "Thank you" },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Confirm" }] },
    ],
  });
  assert.equal(mapMetaTemplateStatus("APPROVED"), "approved");
  assert.equal(mapMetaTemplateStatus("PENDING"), "pending");
});

test("template permissions follow the Phase 1 role matrix", () => {
  assert.equal(requirePermission({ role: "admin" }, "templates_manage"), null);
  assert.equal(requirePermission({ role: "sales" }, "templates_manage"), null);
  assert.equal(requirePermission({ role: "support" }, "templates_manage").status, 403);
  for (const role of ["admin", "support", "sales", "accounts"]) assert.equal(requirePermission({ role }, "templates_send"), null);
});

test("template routes enforce tenant scope, approval state, and opt-in rollout boundary", () => {
  const sendRoute = readFileSync(resolve("src/app/api/conversations/[id]/send-template/route.ts"), "utf8");
  const deleteRoute = readFileSync(resolve("src/app/api/templates/[id]/route.ts"), "utf8");
  assert.match(sendRoute, /\.eq\("business_id", access\.businessId\)/);
  assert.match(sendRoute, /template\.status !== "approved"/);
  assert.match(sendRoute, /template\.category === "MARKETING"/);
  assert.match(sendRoute, /getOwnedConversation\(/);
  assert.match(deleteRoute, /\.eq\("business_id", access\.businessId\)/);
});
