import { NextRequest } from "next/server";
import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { reactivateOwnerAlerts } from "@/lib/owner-alerts";

const SETTINGS = "owner_alerts_enabled, owner_whatsapp_alerts_enabled, owner_whatsapp_number, owner_alert_realert_minutes, owner_alert_quiet_hours_start, owner_alert_quiet_hours_end, owner_alert_timezone";

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, admin } = access;
  const { data, error } = await admin.from("businesses").select(SETTINGS).eq("id", businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load alert settings" }, { status: 500 });
  if (!data) return Response.json({ error: "Business not found" }, { status: 404 });
  return Response.json({
    settings: data,
    pushConfigured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT),
    whatsappTemplateConfigured: Boolean(process.env.WHATSAPP_OWNER_ALERT_TEMPLATE),
  });
}

export async function PATCH(request: NextRequest) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "owner_alert_settings");
  if (denied) return denied;
  const { businessId, admin } = access;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const allowed = [
    "owner_alerts_enabled",
    "owner_whatsapp_alerts_enabled",
    "owner_whatsapp_number",
    "owner_alert_realert_minutes",
    "owner_alert_quiet_hours_start",
    "owner_alert_quiet_hours_end",
    "owner_alert_timezone",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) update[key] = body[key];
  if (!Object.keys(update).length) return Response.json({ error: "No valid settings provided" }, { status: 400 });

  for (const key of ["owner_alerts_enabled", "owner_whatsapp_alerts_enabled"] as const) {
    if (key in update && typeof update[key] !== "boolean") {
      return Response.json({ error: `${key} must be true or false` }, { status: 400 });
    }
  }
  if ("owner_whatsapp_number" in update) {
    const number = update.owner_whatsapp_number;
    if (number !== null && (typeof number !== "string" || !/^\+[1-9]\d{7,14}$/.test(number))) {
      return Response.json({ error: "Owner WhatsApp number must use international format, such as +919876543210" }, { status: 400 });
    }
  }
  if ("owner_whatsapp_alerts_enabled" in update && update.owner_whatsapp_alerts_enabled && !process.env.WHATSAPP_OWNER_ALERT_TEMPLATE) {
    return Response.json({ error: "Configure an approved WhatsApp owner alert template before enabling WhatsApp alerts" }, { status: 400 });
  }
  if (update.owner_whatsapp_alerts_enabled === true && (typeof update.owner_whatsapp_number !== "string" || !/^\+[1-9]\d{7,14}$/.test(update.owner_whatsapp_number))) {
    return Response.json({ error: "Save the owner's international WhatsApp number before enabling WhatsApp alerts" }, { status: 400 });
  }
  if ("owner_alert_realert_minutes" in update) {
    const value = update.owner_alert_realert_minutes;
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1440) {
      return Response.json({ error: "Re-alert interval must be between 1 and 1440 minutes" }, { status: 400 });
    }
  }
  for (const key of ["owner_alert_quiet_hours_start", "owner_alert_quiet_hours_end"] as const) {
    if (key in update && !validTime(update[key])) {
      return Response.json({ error: "Quiet hours must use a valid 24-hour time" }, { status: 400 });
    }
  }
  if ("owner_alert_timezone" in update && !validTimeZone(update.owner_alert_timezone)) {
    return Response.json({ error: "Choose a valid time zone" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("businesses")
    .update(update)
    .eq("id", businessId)
    .select(SETTINGS)
    .maybeSingle();
  if (error) return Response.json({ error: "Unable to save alert settings" }, { status: 500 });
  if (!data) return Response.json({ error: "Business not found" }, { status: 404 });

  await reactivateOwnerAlerts(businessId);
  return Response.json({ settings: data });
}
