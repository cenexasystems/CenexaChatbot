import { NextRequest } from "next/server";
import { processDueOwnerAlerts } from "@/lib/owner-alerts";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const processed = await processDueOwnerAlerts();
  return Response.json({ ok: true, processed });
}
