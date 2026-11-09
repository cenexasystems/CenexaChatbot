import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { dateInTimezone, reportRowsToCsv, validReportRange, type ReportRow } from "@/lib/reports";

const METRICS = new Set([
  "new_contacts", "messages_in", "messages_out", "handoffs_raised", "handoffs_resolved",
  "handoff_response_median_minutes", "payments_pending", "payments_verified", "payments_rejected",
  "sales_inr", "campaign_sent", "campaign_delivered", "campaign_read", "campaign_replied", "campaign_paid",
  "automation_sent", "automation_skipped",
]);

export async function GET(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "reports_view"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "reports"); if (disabled) return disabled;
  const { data: business, error: businessError } = await access.admin.from("businesses").select("owner_alert_timezone,reporting_history_start_date").eq("id", access.businessId).maybeSingle();
  if (businessError || !business) return Response.json({ error: "Unable to load report settings" }, { status: 500 });
  let timeZone = business.owner_alert_timezone || "Asia/Kolkata";
  try { new Intl.DateTimeFormat("en", { timeZone }).format(new Date()); } catch { timeZone = "Asia/Kolkata"; }
  const params = new URL(request.url).searchParams;
  const today = dateInTimezone(new Date(), timeZone);
  const from = params.get("from") ?? today;
  const to = params.get("to") ?? today;
  if (!validReportRange(from, to)) return Response.json({ error: "Choose a valid date range of at most 366 days" }, { status: 400 });
  const selectedMetric = params.get("metric");
  if (selectedMetric && !METRICS.has(selectedMetric)) return Response.json({ error: "Unknown report metric" }, { status: 400 });
  const { data, error } = await access.admin.rpc("get_business_report_series", { p_business_id: access.businessId, p_start_date: from, p_end_date: to });
  if (error) return Response.json({ error: "Unable to calculate report data" }, { status: 500 });
  const rows = ((data ?? []) as ReportRow[]).filter((row) => !selectedMetric || row.metric === selectedMetric);
  if (params.get("format") === "csv") {
    return new Response(reportRowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="chatflow-report-${selectedMetric ?? "all"}-${from}-to-${to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return Response.json({ rows, from, to, timezone: timeZone, historyStartDate: business.reporting_history_start_date });
}
