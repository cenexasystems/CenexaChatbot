import webpush from "web-push";
import { getSupabase } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export type OwnerAlertType = "handoff" | "payment";

function minutesInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour * 60 + minute;
}

function parseMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function isQuietAt(date: Date, start: number, end: number, timeZone: string): boolean {
  if (start === end) return false;
  const current = minutesInZone(date, timeZone);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function nextQuietEnd(now: Date, start: number, end: number, timeZone: string): Date {
  const next = new Date(now);
  for (let minute = 0; minute < 26 * 60; minute++) {
    next.setTime(next.getTime() + 60_000);
    if (!isQuietAt(next, start, end, timeZone)) return next;
  }
  return new Date(now.getTime() + 8 * 60 * 60_000);
}

function publicAppUrl(path: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const fallback = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://cenexasystems.com";
  try {
    return new URL(path, configured || fallback).toString();
  } catch {
    return new URL(path, fallback).toString();
  }
}

export async function enqueueOwnerAlert(
  businessId: string,
  conversationId: string,
  type: OwnerAlertType,
  eventId: string
): Promise<void> {
  const supabase = getSupabase();
  const { data: openAlert } = await supabase
    .from("owner_alerts")
    .select("id")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("alert_type", type)
    .eq("status", "open")
    .maybeSingle();
  if (openAlert) return;

  const eventKey = `${type}:${conversationId}:${eventId}`;
  const { data, error } = await supabase
    .from("owner_alerts")
    .insert({
      business_id: businessId,
      conversation_id: conversationId,
      alert_type: type,
      event_key: eventKey,
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error?.code === "23505") return;
  if (error || !data) {
    console.error("[owner-alerts] could not queue alert:", error?.message);
    return;
  }
  await deliverOwnerAlert(data.id);
}

export async function resolveOwnerAlertsForConversation(
  businessId: string,
  conversationId: string,
  types: OwnerAlertType[] = ["handoff", "payment"]
): Promise<void> {
  let query = getSupabase()
    .from("owner_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), next_attempt_at: null, processing_at: null })
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("status", "open");
  if (types.length === 1) query = query.eq("alert_type", types[0]);
  else query = query.in("alert_type", types);
  const { error } = await query;
  if (error) console.error("[owner-alerts] could not resolve alerts:", error.message);
}

export async function reactivateOwnerAlerts(businessId: string): Promise<void> {
  const now = new Date().toISOString();
  await getSupabase()
    .from("owner_alerts")
    .update({ next_attempt_at: now })
    .eq("business_id", businessId)
    .eq("status", "open");
  await processDueOwnerAlerts(100);
}

async function deliverOwnerAlert(alertId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: alert, error: alertError } = await supabase
    .from("owner_alerts")
    .select("id, business_id, conversation_id, alert_type, attempt_count, last_notified_at, status")
    .eq("id", alertId)
    .maybeSingle();
  if (alertError || !alert || alert.status !== "open") return;

  const claimedAt = new Date();
  const staleLock = new Date(claimedAt.getTime() - 10 * 60_000).toISOString();
  const { data: claim, error: claimError } = await supabase
    .from("owner_alerts")
    .update({ processing_at: claimedAt.toISOString() })
    .eq("id", alertId)
    .eq("status", "open")
    .or(`processing_at.is.null,processing_at.lt.${staleLock}`)
    .select("id")
    .maybeSingle();
  if (claimError || !claim) return;

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, phone_number_id, access_token, owner_alerts_enabled, owner_whatsapp_alerts_enabled, owner_whatsapp_number, owner_alert_realert_minutes, owner_alert_quiet_hours_start, owner_alert_quiet_hours_end, owner_alert_timezone")
    .eq("id", alert.business_id)
    .maybeSingle();
  if (businessError || !business) return;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, phone")
    .eq("id", alert.conversation_id)
    .eq("business_id", alert.business_id)
    .maybeSingle();
  if (conversationError || !conversation) return;

  const now = new Date();
  const timeZone = business.owner_alert_timezone || "Asia/Kolkata";
  const start = parseMinutes(business.owner_alert_quiet_hours_start);
  const end = parseMinutes(business.owner_alert_quiet_hours_end);
  if (start !== null && end !== null && isQuietAt(now, start, end, timeZone)) {
    await supabase.from("owner_alerts").update({ next_attempt_at: nextQuietEnd(now, start, end, timeZone).toISOString(), processing_at: null }).eq("id", alertId).eq("status", "open");
    return;
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  let pushCount = 0;
  let pushDeliveredCount = 0;
  let pushConfigured = Boolean(business.owner_alerts_enabled && publicKey && privateKey && subject);

  if (business.owner_alerts_enabled && publicKey && privateKey && subject) {
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("business_id", business.id);
    if (subscriptionsError) {
      console.error("[owner-alerts] push subscription lookup failed:", subscriptionsError.message);
    } else {
      pushCount = subscriptions?.length ?? 0;
      if (pushCount === 0) pushConfigured = false;
      const title = alert.alert_type === "payment" ? "Payment needs review" : "A customer needs you";
      const body = alert.alert_type === "payment"
        ? `${business.name} has a payment screenshot to check.`
        : `${business.name} has a customer waiting for a person.`;
      const payload = JSON.stringify({ title, body, url: `/inbox/${conversation.id}` });
      const vapidDetails = { subject, publicKey, privateKey };

      await Promise.all((subscriptions ?? []).map(async (item: { id: string; subscription: Parameters<typeof webpush.sendNotification>[0] }) => {
        try {
          await webpush.sendNotification(item.subscription, payload, {
            vapidDetails,
            TTL: 60 * 60,
            urgency: "high",
          });
          pushDeliveredCount++;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", item.id);
          }
          console.error("[owner-alerts] web push delivery failed:", statusCode ?? "unknown");
        }
      }));
    }
  }

  const templateName = process.env.WHATSAPP_OWNER_ALERT_TEMPLATE;
  const languageCode = process.env.WHATSAPP_OWNER_ALERT_LANGUAGE || "en";
  const ownerNumber = business.owner_whatsapp_number;
  const whatsappConfigured = Boolean(
    business.owner_alerts_enabled && business.owner_whatsapp_alerts_enabled && ownerNumber && business.phone_number_id && business.access_token && templateName
  );
  let whatsappSent = false;
  if (whatsappConfigured) {
    const label = alert.alert_type === "payment" ? "Payment review needed" : "Customer asked for a person";
    const openUrl = publicAppUrl(`/inbox/${conversation.id}`);
    try {
      const response = await sendWhatsAppTemplate(
        ownerNumber!.replace(/\D/g, ""),
        templateName!,
        languageCode,
        [label, conversation.phone, openUrl],
        { phoneNumberId: business.phone_number_id, accessToken: business.access_token }
      );
      whatsappSent = !response?.error && Boolean(response?.messages?.[0]?.id);
      if (!whatsappSent) console.error("[owner-alerts] WhatsApp template delivery failed");
    } catch {
      console.error("[owner-alerts] WhatsApp template request failed");
    }
  }

  const anyChannelConfigured = pushConfigured || whatsappConfigured;
  const anyDelivered = pushDeliveredCount > 0 || whatsappSent;
  const nextAttempt = anyChannelConfigured
    ? new Date(now.getTime() + Math.max(1, business.owner_alert_realert_minutes) * 60_000).toISOString()
    : null;
  await supabase
    .from("owner_alerts")
    .update({
      attempt_count: alert.attempt_count + 1,
      last_notified_at: anyDelivered ? now.toISOString() : alert.last_notified_at,
      next_attempt_at: nextAttempt,
      processing_at: null,
      last_error: anyDelivered ? null : anyChannelConfigured ? "Delivery failed" : "No alert channel is configured",
    })
    .eq("id", alertId)
    .eq("status", "open");
}

export async function processDueOwnerAlerts(limit = 100): Promise<number> {
  const supabase = getSupabase();
  const { data: due, error } = await supabase
    .from("owner_alerts")
    .select("id")
    .eq("status", "open")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[owner-alerts] could not load due alerts:", error.message);
    return 0;
  }

  await Promise.all((due ?? []).map((alert: { id: string }) => deliverOwnerAlert(alert.id)));
  return due?.length ?? 0;
}
