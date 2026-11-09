export type ReportRow = { report_date: string; metric: string; dimension: string; value: number | string; period_total: number | string };

export function dateInTimezone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

export function validReportRange(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const from = new Date(`${start}T00:00:00Z`), to = new Date(`${end}T00:00:00Z`);
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return Number.isFinite(days) && days >= 0 && days <= 365 && from.toISOString().slice(0, 10) === start && to.toISOString().slice(0, 10) === end;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[\r\n,"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reportRowsToCsv(rows: ReportRow[]) {
  const lines = ["date,metric,category,value,period_total", ...rows.map((row) => [row.report_date, row.metric, row.dimension, row.value, row.period_total].map(csvCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}`;
}
