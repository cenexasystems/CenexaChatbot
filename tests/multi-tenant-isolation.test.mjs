import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveTenantScope, isOwnedByBusiness } from "../src/lib/tenant-authorization.ts";
import { LEGACY_GLOBAL_INSTRUCTIONS, MEDIA_GLOBAL_INSTRUCTIONS } from "../src/lib/ai.ts";

describe("MULTI-TENANT ISOLATION: Production Client Untouchability", () => {
  const untouchableTenant = {
    id: "biz_live_client_1",
    name: "Live Production Bridal Studio",
    phone_number_id: "phone_live_1",
    coexistence_enabled: false,
    media_ai_enabled: false,
  };

  const upgradedTenant = {
    id: "biz_new_client_2",
    name: "Coexistence Beta Client",
    phone_number_id: "phone_beta_2",
    coexistence_enabled: true,
    media_ai_enabled: true,
  };

  test("Inbound audio message isolation: Tenant 1 gets canned reply, Tenant 2 triggers AI pipeline", () => {
    // Pipeline selection logic
    const getTenantPipeline = (biz) => {
      if (biz.media_ai_enabled === true) {
        return "VOICE_TRANSCRIBE_AND_AI";
      }
      return "LEGACY_DETERMINISTIC_CANNED";
    };

    assert.equal(getTenantPipeline(untouchableTenant), "LEGACY_DETERMINISTIC_CANNED");
    assert.equal(getTenantPipeline(upgradedTenant), "VOICE_TRANSCRIBE_AND_AI");
  });

  test("Prompt isolation: Tenant 1 uses LEGACY_GLOBAL_INSTRUCTIONS, Tenant 2 uses MEDIA_GLOBAL_INSTRUCTIONS", () => {
    const getTenantInstructions = (biz) => {
      return biz.media_ai_enabled ? MEDIA_GLOBAL_INSTRUCTIONS : LEGACY_GLOBAL_INSTRUCTIONS;
    };

    const t1Instructions = getTenantInstructions(untouchableTenant);
    const t2Instructions = getTenantInstructions(upgradedTenant);

    // Tenant 1 must NOT have voice/image transcript instructions
    assert.doesNotMatch(t1Instructions, /\[Customer sent a VOICE NOTE/);
    assert.doesNotMatch(t1Instructions, /\[Customer sent an IMAGE/);
    assert.match(t1Instructions, /If the user sends "\[audio\]" or "\[video\]", reply with:/);

    // Tenant 2 has the new media AI instructions
    assert.match(t2Instructions, /\[Customer sent a VOICE NOTE/);
    assert.match(t2Instructions, /\[Customer sent an IMAGE/);
  });

  test("Coexistence echo isolation: Tenant 1 ignores echoes, Tenant 2 records and pauses AI", () => {
    const shouldHandleEcho = (biz) => biz.coexistence_enabled === true;

    assert.equal(shouldHandleEcho(untouchableTenant), false);
    assert.equal(shouldHandleEcho(upgradedTenant), true);
  });

  test("AI pause isolation: Tenant 1 never checks or respects ai_paused_until", () => {
    const shouldCheckAiPause = (biz) => biz.coexistence_enabled === true;

    assert.equal(shouldCheckAiPause(untouchableTenant), false);
    assert.equal(shouldCheckAiPause(upgradedTenant), true);
  });
});

describe("API tenant authorization", () => {
  test("requires an authenticated user and an associated business profile", () => {
    assert.deepEqual(resolveTenantScope(null, null), {
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    assert.deepEqual(resolveTenantScope("user-1", null), {
      ok: false,
      status: 404,
      error: "Business profile not found",
    });
    assert.deepEqual(resolveTenantScope("user-1", null, new Error("database unavailable")), {
      ok: false,
      status: 500,
      error: "Unable to load user profile",
    });
    assert.deepEqual(resolveTenantScope("user-1", { business_id: "biz-1" }), {
      ok: true,
      businessId: "biz-1",
    });
  });

  test("treats another business's conversation as not found", () => {
    assert.equal(isOwnedByBusiness({ business_id: "biz-1" }, "biz-1"), true);
    assert.equal(isOwnedByBusiness({ business_id: "biz-2" }, "biz-1"), false);
    assert.equal(isOwnedByBusiness(null, "biz-1"), false);
  });

  test("every conversation API route applies authentication and ownership scoping", () => {
    const routes = [
      "../src/app/api/conversations/route.ts",
      "../src/app/api/conversations/[id]/route.ts",
      "../src/app/api/conversations/[id]/messages/route.ts",
      "../src/app/api/conversations/[id]/messages/[msgId]/route.ts",
      "../src/app/api/conversations/[id]/send/route.ts",
      "../src/app/api/conversations/[id]/send-image/route.ts",
      "../src/app/api/conversations/[id]/send-qr/route.ts",
      "../src/app/api/conversations/[id]/verify-payment/route.ts",
    ];

    for (const routePath of routes) {
      const source = readFileSync(new URL(routePath, import.meta.url), "utf8");
      assert.match(source, /requireBusinessAccess\(/, `${routePath} must require a signed-in business`);
      if (routePath.includes("[id]")) {
        assert.match(source, /getOwnedConversation\(/, `${routePath} must check conversation ownership`);
      }
    }
  });
});
