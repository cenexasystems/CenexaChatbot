export type AutomationRule = "follow_up" | "payment_reminder" | "review_request" | "dated_reminder";
export type QuietHours = { start: string; end: string; timeZone?: string };

function minutesAt(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
}
function parseTime(value: string) { const m = /^(\d{2}):(\d{2})$/.exec(value); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }

export function isWithinQuietHours(now: Date, quiet: QuietHours) {
  const zone = quiet.timeZone || "Asia/Kolkata";
  const start = parseTime(quiet.start), end = parseTime(quiet.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return false;
  const current = minutesAt(now, zone);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function automationRunTime(triggerAt: Date, delayMinutes: number, quiet: QuietHours, now = new Date()) {
  const base = new Date(Math.max(now.getTime(), triggerAt.getTime() + Math.max(0, delayMinutes) * 60_000));
  if (!isWithinQuietHours(base, quiet)) return base;
  const timeZone = quiet.timeZone || "Asia/Kolkata";
  for (let i = 0; i < 26 * 60; i++) {
    base.setTime(base.getTime() + 60_000);
    if (!isWithinQuietHours(base, { ...quiet, timeZone })) return base;
  }
  return new Date(now.getTime() + 8 * 60 * 60_000);
}

export function automationSkipReason(input: { optedOut: boolean; withinWindow: boolean; hasApprovedTemplate: boolean; hasText: boolean; humanTakeover: boolean; customerReplied: boolean; paymentArrived: boolean }) {
  if (input.optedOut) return "Contact opted out";
  if (input.humanTakeover) return "A team member took over";
  if (input.customerReplied) return "Customer replied";
  if (input.paymentArrived) return "Payment arrived";
  if (!input.withinWindow && !input.hasApprovedTemplate) return "Outside the 24-hour window and no approved template is configured";
  if (input.withinWindow && !input.hasText && !input.hasApprovedTemplate) return "No message configured";
  return null;
}
