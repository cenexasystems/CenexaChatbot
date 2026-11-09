import { test } from "node:test";
import assert from "node:assert/strict";
import { requirePermission, requireStrictPermission } from "../src/lib/permissions.ts";

test("Phase 0 permissions preserve the existing admin-only routes", () => {
  for (const action of ["assistant_settings", "assistant_test", "owner_alert_settings"]) {
    assert.equal(requirePermission({ role: "admin" }, action), null);
    for (const role of ["support", "sales", "accounts"]) {
      const response = requirePermission({ role }, action);
      assert.equal(response?.status, 403, `${role} should be denied ${action}`);
    }
  }
});

test("strict roles preserve legacy behavior when off and enforce the role matrix when on", () => {
  assert.equal(requireStrictPermission({ role: "accounts", strictRoles: false }, "conversation_reply"), null);
  assert.equal(requireStrictPermission({ role: "accounts", strictRoles: true }, "conversation_reply")?.status, 403);
  assert.equal(requireStrictPermission({ role: "accounts", strictRoles: true }, "payment_verify"), null);
  assert.equal(requirePermission({ role: "accounts" }, "reports_view"), null);
  assert.equal(requirePermission({ role: "support" }, "reports_view")?.status, 403);
  assert.equal(requirePermission({ role: "sales" }, "team_manage")?.status, 403);
});

test("chat CSV export is restricted to business admins", () => {
  assert.equal(requirePermission({ role: "admin" }, "conversation_export"), null);
  assert.equal(requirePermission({ role: "support" }, "conversation_export")?.status, 403);
  assert.equal(requirePermission({ role: "sales" }, "conversation_export")?.status, 403);
  assert.equal(requirePermission({ role: "accounts" }, "conversation_export")?.status, 403);
});
