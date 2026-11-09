import { NextRequest } from "next/server";
import { processDueOwnerAlerts } from "@/lib/owner-alerts";
import { processCampaignQueue, processAutomationRuns } from "@/lib/campaign-engine";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getSupabase();
  const started = new Date().toISOString();
  await db.from("cron_runs").upsert({ job: "owner-alerts", last_started_at: started, last_error: null, updated_at: started }, { onConflict: "job" });
  try {
    const processed = await processDueOwnerAlerts();
    const [campaigns, automations] = await Promise.all([processCampaignQueue(), processAutomationRuns()]);
    const day = new Date().toISOString().slice(0, 10);
    const { error: usageError } = await db.rpc("refresh_platform_usage_daily", { p_day: day });
    if (usageError) throw usageError;
    await db.from("cron_runs").upsert({ job: "owner-alerts", last_started_at: started, last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }, { onConflict: "job" });
    return Response.json({ ok: true, processed, campaigns, automations });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown cron error";
    await db.from("cron_runs").upsert({ job: "owner-alerts", last_started_at: started, last_error: message, updated_at: new Date().toISOString() }, { onConflict: "job" });
    console.error("[cron/owner-alerts] job failed:", message);
    return Response.json({ error: "Scheduled job failed" }, { status: 500 });
  }
}
