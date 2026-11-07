/**
 * scripts/backfill-waba-id-dryrun.js
 *
 * DRY-RUN helper: reads every active business from Supabase, calls the
 * Meta Graph API debug_token endpoint with each stored access token,
 * extracts the WABA ID from granular scopes, and PRINTS the result.
 *
 * ⚠️  READ-ONLY. This script never writes to the database.
 *     Review the output carefully, then tell the team to run the
 *     write pass (backfill-waba-id-write.js, created separately after approval).
 *
 * Usage:
 *   node scripts/backfill-waba-id-dryrun.js
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL    in env or .env.local
 *   SUPABASE_SERVICE_ROLE_KEY   in env or .env.local
 *   NEXT_PUBLIC_META_APP_ID     in env or .env.local
 *   META_APP_SECRET             in env or .env.local
 *
 * Run on STAGING credentials first to confirm the script works before
 * pointing it at production.
 */

"use strict";

// Load .env.local if present
try {
  require("fs").readFileSync(".env.local", "utf8")
    .split("\n")
    .forEach((line) => {
      const eq = line.indexOf("=");
      if (eq < 1) return;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && v && !process.env[k]) process.env[k] = v;
    });
} catch { /* no .env.local */ }

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID        = process.env.NEXT_PUBLIC_META_APP_ID;
const APP_SECRET    = process.env.META_APP_SECRET;
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`;

function validateEnv() {
  const missing = [];
  if (!SUPABASE_URL)  missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY)   missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!APP_ID)        missing.push("NEXT_PUBLIC_META_APP_ID");
  if (!APP_SECRET)    missing.push("META_APP_SECRET");
  if (missing.length) {
    console.error("❌  Missing env vars:", missing.join(", "));
    process.exit(1);
  }
}

async function fetchWabaFromToken(businessId, name, accessToken) {
  const url = `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${APP_ID}|${APP_SECRET}`;
  let res, data;
  try {
    res  = await fetch(url);
    data = await res.json();
  } catch (err) {
    return { ok: false, reason: `network error: ${err.message}` };
  }

  if (!res.ok || data.error || !data.data) {
    return { ok: false, reason: data.error?.message ?? `HTTP ${res.status}` };
  }

  if (!data.data.is_valid) {
    return { ok: false, reason: "token is expired or invalid" };
  }

  const wabaIds = [];
  for (const scope of data.data.granular_scopes ?? []) {
    if (scope.scope === "whatsapp_business_management") {
      wabaIds.push(...(scope.target_ids ?? []));
    }
  }

  if (wabaIds.length === 0) {
    return { ok: false, reason: "no whatsapp_business_management scope found" };
  }

  return {
    ok: true,
    wabaIds,        // may be more than one — first is the primary
    appId: data.data.app_id,
    expiresAt: data.data.expires_at
      ? new Date(data.data.expires_at * 1000).toISOString()
      : "never (permanent token)",
  };
}

async function main() {
  validateEnv();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  WABA ID Backfill — DRY RUN (read-only, no DB writes)");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Graph:    ${GRAPH_BASE}`);
  console.log("════════════════════════════════════════════════════════════\n");

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, phone_number_id, waba_id, access_token")
    .eq("is_active", true)
    .order("created_at");

  if (error) {
    console.error("❌  Could not fetch businesses:", error.message);
    process.exit(1);
  }

  console.log(`Found ${businesses.length} active business(es).\n`);

  const results = [];

  for (const biz of businesses) {
    process.stdout.write(`  [${biz.name ?? biz.id}] checking… `);

    if (biz.waba_id) {
      console.log(`ALREADY SET → ${biz.waba_id}  (skip)`);
      results.push({ id: biz.id, name: biz.name, status: "already_set", waba_id: biz.waba_id });
      continue;
    }

    if (!biz.access_token) {
      console.log(`NO ACCESS TOKEN — cannot look up`);
      results.push({ id: biz.id, name: biz.name, status: "no_token" });
      continue;
    }

    const r = await fetchWabaFromToken(biz.id, biz.name, biz.access_token);

    if (!r.ok) {
      console.log(`FAILED → ${r.reason}`);
      results.push({ id: biz.id, name: biz.name, status: "failed", reason: r.reason });
    } else {
      const primary = r.wabaIds[0];
      const extra   = r.wabaIds.slice(1);
      console.log(`OK → waba_id = ${primary}${extra.length ? `  (also: ${extra.join(", ")})` : ""}`);
      if (extra.length > 1) {
        console.log(`     ⚠️  Multiple WABAs found — using the first. Confirm this is correct.`);
      }
      console.log(`     token expires: ${r.expiresAt}`);
      results.push({
        id: biz.id,
        name: biz.name,
        phone_number_id: biz.phone_number_id,
        status: "found",
        waba_id: primary,
        all_waba_ids: r.wabaIds,
        token_expires: r.expiresAt,
      });
    }

    // Polite rate-limiting: 1 call/sec
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  SUMMARY (review before approving the write pass)");
  console.log("════════════════════════════════════════════════════════════\n");

  const found    = results.filter((r) => r.status === "found");
  const failed   = results.filter((r) => r.status === "failed");
  const noToken  = results.filter((r) => r.status === "no_token");
  const existing = results.filter((r) => r.status === "already_set");

  console.log(`  ✅  Ready to write:  ${found.length}`);
  for (const r of found) {
    console.log(`        UPDATE businesses SET waba_id = '${r.waba_id}' WHERE id = '${r.id}';  -- ${r.name}`);
  }

  if (existing.length) {
    console.log(`\n  ℹ️   Already set:    ${existing.length} (will not be overwritten)`);
    for (const r of existing) {
      console.log(`        ${r.name}: ${r.waba_id}`);
    }
  }

  if (failed.length) {
    console.log(`\n  ❌  Failed:          ${failed.length}`);
    for (const r of failed) {
      console.log(`        ${r.name}: ${r.reason}`);
    }
    console.log(`\n  ⚠️   Expired/invalid tokens must be refreshed before the write pass.`);
    console.log(`       Ask the client to re-onboard or generate a new system-user token in Meta Business.`);
  }

  if (noToken.length) {
    console.log(`\n  ⚠️   No token:        ${noToken.length}`);
    for (const r of noToken) {
      console.log(`        ${r.name} (${r.id})`);
    }
  }

  console.log("\n  ─────────────────────────────────────────────────────────");
  console.log("  This was a DRY RUN. Nothing was written to the database.");
  console.log("  Confirm the WABA IDs above are correct, then tell the team");
  console.log("  to run the write pass to apply them.");
  console.log("  ─────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
