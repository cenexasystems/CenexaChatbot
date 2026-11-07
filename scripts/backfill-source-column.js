/**
 * scripts/backfill-source-column.js
 *
 * Backfills messages.source for rows that were created before the
 * 20261013_coexistence_and_media_ai.sql migration.
 *
 * Logic:
 *   role = 'user'      → source = 'customer'
 *   role = 'assistant' → source = 'ai'
 *
 * Runs in batches of BATCH_SIZE rows with a SHORT_SLEEP_MS pause between
 * batches to avoid locking the table for long periods while the live app
 * is running.
 *
 * Usage:
 *   DRY_RUN=true  node scripts/backfill-source-column.js   ← safe, prints plan only
 *   DRY_RUN=false node scripts/backfill-source-column.js   ← writes (run AFTER team approval)
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL      in env (or .env.local)
 *   SUPABASE_SERVICE_ROLE_KEY     in env (or .env.local)
 *
 * ⚠️  Run on STAGING first. Confirm row counts match expectations.
 *     Only run on production after team approval.
 */

"use strict";

// Load .env.local if present (won't fail if absent)
try {
  require("fs").readFileSync(".env.local", "utf8")
    .split("\n")
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (k && rest.length && !process.env[k.trim()]) {
        process.env[k.trim()] = rest.join("=").trim();
      }
    });
} catch { /* no .env.local — rely on shell env */ }

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN      = process.env.DRY_RUN !== "false"; // default: dry run
const BATCH_SIZE   = 5000;
const SHORT_SLEEP_MS = 200; // pause between batches

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

if (SUPABASE_URL.includes("rjqxwx")) {
  console.error("❌  SUPABASE_URL looks like the PRODUCTION project.");
  console.error("    This script must only be run on STAGING first.");
  console.error("    Set DRY_RUN=true and use the staging URL.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`\n📊  Backfill: messages.source`);
  console.log(`    Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "⚠️  LIVE WRITE"}`);
  console.log(`    URL:  ${SUPABASE_URL}\n`);

  // Count rows that need backfill
  const { count, error: countErr } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .is("source", null);

  if (countErr) {
    console.error("❌  Could not count rows:", countErr.message);
    process.exit(1);
  }

  console.log(`    Rows with source = NULL: ${count}`);
  if (count === 0) {
    console.log("✅  Nothing to backfill.");
    return;
  }

  const batches = Math.ceil(count / BATCH_SIZE);
  console.log(`    Batch size: ${BATCH_SIZE}  →  ~${batches} batch(es)\n`);

  if (DRY_RUN) {
    console.log("    DRY RUN: would run the following UPDATE in batches:");
    console.log(`\n      UPDATE messages`);
    console.log(`         SET source = CASE WHEN role = 'user' THEN 'customer' ELSE 'ai' END`);
    console.log(`       WHERE source IS NULL`);
    console.log(`       LIMIT ${BATCH_SIZE};  -- repeated until 0 rows updated\n`);
    console.log("    Re-run with DRY_RUN=false to apply.");
    return;
  }

  // Live write: batch UPDATE via RPC
  // We use Supabase's .rpc() to run raw SQL in batches.
  // If your Supabase project does not allow arbitrary RPC, use the
  // SQL Editor in the Supabase Dashboard instead and run the batched
  // UPDATE manually.

  let totalUpdated = 0;
  let batch = 0;

  while (true) {
    batch++;
    console.log(`  Batch ${batch}/${batches}…`);

    // Fetch a batch of IDs
    const { data: rows, error: fetchErr } = await supabase
      .from("messages")
      .select("id, role")
      .is("source", null)
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error(`  ❌  Fetch failed:`, fetchErr.message);
      break;
    }
    if (!rows || rows.length === 0) {
      console.log("  ✅  No more rows.");
      break;
    }

    const customerIds = rows.filter((r) => r.role === "user").map((r) => r.id);
    const aiIds       = rows.filter((r) => r.role !== "user").map((r) => r.id);

    if (customerIds.length) {
      const { error } = await supabase
        .from("messages")
        .update({ source: "customer" })
        .in("id", customerIds);
      if (error) { console.error("  ❌  customer update failed:", error.message); break; }
    }

    if (aiIds.length) {
      const { error } = await supabase
        .from("messages")
        .update({ source: "ai" })
        .in("id", aiIds);
      if (error) { console.error("  ❌  ai update failed:", error.message); break; }
    }

    totalUpdated += rows.length;
    console.log(`  ✓  Updated ${rows.length} rows (total: ${totalUpdated})`);

    if (rows.length < BATCH_SIZE) break; // last batch
    await sleep(SHORT_SLEEP_MS);
  }

  console.log(`\n✅  Done. Total rows updated: ${totalUpdated}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
