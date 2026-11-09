"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Panel, Spinner } from "@/components/cx/ui";
import { Page } from "@/components/cx/Page";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { dateInTimezone, type ReportRow } from "@/lib/reports";
import { demoReportRows } from "@/lib/demo-data";

const METRICS = [
  ["new_contacts", "New contacts", "Contacts"], ["messages_in", "Messages in", "Messages"], ["messages_out", "Messages out", "Messages"],
  ["handoffs_raised", "Handoffs raised", "Handoffs"], ["handoffs_resolved", "Handoffs resolved", "Handoffs"], ["handoff_response_median_minutes", "Median first human reply (min)", "Handoffs"],
  ["payments_pending", "Payments pending", "Payments"], ["payments_verified", "Payments verified", "Payments"], ["payments_rejected", "Payments rejected", "Payments"], ["sales_inr", "Verified sales", "Payments"],
  ["campaign_sent", "Campaign sent", "Campaigns"], ["campaign_delivered", "Campaign delivered", "Campaigns"], ["campaign_read", "Campaign read", "Campaigns"], ["campaign_replied", "Campaign replied", "Campaigns"], ["campaign_paid", "Campaign paid", "Campaigns"],
  ["automation_sent", "Automation sent", "Automations"], ["automation_skipped", "Automation skipped", "Automations"],
] as const;
const EMPTY_ROWS: ReportRow[] = [];
type MetricKey = typeof METRICS[number][0];
type Payload = { rows: ReportRow[]; from: string; to: string; timezone: string; historyStartDate: string };
const field = "rounded-lg border border-line-strong bg-surface px-3 py-2 text-[12px]";

function shiftDate(date: string, amount: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function makeDemoPayload(): Payload {
  const today = dateInTimezone(new Date(), "Asia/Kolkata");
  const rows: ReportRow[] = demoReportRows(today);
  return { from: today, to: today, timezone: "Asia/Kolkata", historyStartDate: "2026-10-01", rows };
}

export function ReportsManager() {
  const { demo } = useDashboard();
  const [payload, setPayload] = useState<Payload | null>(() => demo ? makeDemoPayload() : null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [metric, setMetric] = useState<MetricKey>("new_contacts");
  const [loading, setLoading] = useState(!demo); const [error, setError] = useState("");

  useEffect(() => {
    if (demo) return;
    let active = true;
    fetch("/api/reports").then(async (res) => { const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error ?? "Could not load reports"); if (!active) return; setPayload(data); setTimezone(data.timezone); setFrom(data.from); setTo(data.to); })
      .catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demo]);

  async function loadRange(start = from, end = to) {
    setLoading(true); setError("");
    try { const res = await fetch(`/api/reports?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error ?? "Could not load reports"); setPayload(data); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  function preset(days: number) {
    const end = dateInTimezone(new Date(), timezone); const start = shiftDate(end, -(days - 1)); setFrom(start); setTo(end); void loadRange(start, end);
  }

  const rows = payload?.rows ?? EMPTY_ROWS;
  const grouped = useMemo(() => {
    const map = new Map<MetricKey, ReportRow[]>();
    for (const key of METRICS.map((item) => item[0])) map.set(key, rows.filter((row) => row.metric === key));
    return map;
  }, [rows]);
  const dataExists = rows.length > 0;

  return <Page wide section="Insights" title="Reports" subtitle="Daily chats, leads, payments, campaigns, and automation" action={<span className="text-[11px] text-ink-faint">{payload?.timezone ?? timezone}</span>}>
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => preset(1)}>Today</Button><Button size="sm" variant="secondary" onClick={() => preset(7)}>7 days</Button><Button size="sm" variant="secondary" onClick={() => preset(30)}>30 days</Button></div>
      <label className="text-[10px] text-ink-faint">From<input className={`${field} ml-1`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="text-[10px] text-ink-faint">To<input className={`${field} ml-1`} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <Button size="sm" onClick={() => void loadRange()}>Apply</Button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-danger-tint p-3 text-[13px] text-danger">{error}</p>}
    {payload && <p className="mb-4 rounded-lg bg-canvas p-3 text-[11px] text-ink-soft">Payment and sales history is recorded from {payload.historyStartDate}. Earlier payment changes were not stored.</p>}
    {loading ? <div className="flex justify-center p-12"><Spinner /></div> : !dataExists ? <EmptyState icon="chart" title="No report data for these dates" body="Try a wider date range or check again after new activity arrives." /> : <div className="space-y-4">
      {(["Contacts", "Messages", "Handoffs", "Payments", "Campaigns", "Automations"] as const).map((section) => <Panel key={section} title={section} icon="chart"><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
        {METRICS.filter((item) => item[2] === section).map(([key, title]) => <MetricCard key={key} metric={key} title={title} rows={grouped.get(key) ?? []} from={payload!.from} to={payload!.to} />)}
      </div></Panel>)}
      <Panel title="Export report table" icon="history"><div className="flex flex-wrap items-center gap-2 p-4"><select className={field} value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>{METRICS.map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select><a className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-[12px] font-semibold text-white" href={`/api/reports?from=${payload!.from}&to=${payload!.to}&metric=${metric}&format=csv`}>Download CSV</a><span className="text-[11px] text-ink-faint">The export matches the selected metric&apos;s daily report rows.</span></div></Panel>
    </div>}
  </Page>;
}

function MetricCard({ metric, title, rows, from, to }: { metric: MetricKey; title: string; rows: ReportRow[]; from: string; to: string }) {
  const total = Number(rows[0]?.period_total ?? 0);
  const currency = metric === "sales_inr";
  const days: string[] = []; for (let date = from; date <= to && days.length <= 366; date = shiftDate(date, 1)) days.push(date);
  const values = days.map((date) => rows.filter((row) => row.report_date === date).reduce((sum, row) => sum + Number(row.value), 0));
  const max = Math.max(1, ...values);
  const bars = values.map((value, index) => <rect key={days[index]} x={index * (1000 / values.length)} y={100 - (value / max) * 90} width={Math.max(1, 1000 / values.length - 3)} height={(value / max) * 90} rx="2" fill="currentColor" />);
  return <div className="rounded-xl border border-line p-3 min-w-0"><p className="text-[11px] text-ink-faint">{title}</p><p className="mt-1 text-[21px] font-bold tabular">{currency ? `₹${total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : Number.isInteger(total) ? total.toLocaleString("en-IN") : total.toFixed(1)}</p><svg className="mt-3 h-12 w-full text-brand" viewBox="0 0 1000 105" preserveAspectRatio="none" role="img" aria-label={`${title} by day`}>{bars}</svg></div>;
}
