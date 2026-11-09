import { getSupabase } from "@/lib/supabase";
import { automationRunTime, type AutomationRule, type QuietHours } from "@/lib/automations";

export async function enqueueAutomationForConversation(businessId: string, conversationId: string, ruleType: AutomationRule, triggerKey: string, delayMinutes?: number) {
  const db = getSupabase();
  const [{ data: business }, { data: conversation }, { data: automation }] = await Promise.all([
    db.from("businesses").select("modules_enabled").eq("id", businessId).maybeSingle(),
    db.from("conversations").select("id, phone").eq("id", conversationId).eq("business_id", businessId).maybeSingle(),
    db.from("automations").select("id, config, enabled").eq("business_id", businessId).eq("rule_type", ruleType).maybeSingle(),
  ]);
  if (business?.modules_enabled?.automations !== true || !conversation || !automation?.enabled) return;
  const { data: contact } = await db.from("contacts").select("id, opt_out_at").eq("business_id", businessId).eq("phone", conversation.phone).maybeSingle();
  if (!contact || contact.opt_out_at) return;
  const config = automation.config ?? {};
  const delay = delayMinutes ?? Number(config.delay_minutes ?? 0);
  const runAt = automationRunTime(new Date(), delay, {
    start: config.quiet_hours_start ?? "21:00", end: config.quiet_hours_end ?? "09:00", timeZone: "Asia/Kolkata",
  } as QuietHours);
  await db.from("automation_runs").upsert({
    business_id: businessId, automation_id: automation.id, contact_id: contact.id, conversation_id: conversationId,
    trigger_event_key: triggerKey, run_at: runAt.toISOString(), status: "queued",
  }, { onConflict: "automation_id,trigger_event_key", ignoreDuplicates: true });
}

export async function cancelContactAutomationRuns(businessId: string, contactId: string, reason: string, ruleTypes?: AutomationRule[]) {
  let query = getSupabase().from("automation_runs").update({ status: "cancelled", reason, locked_at: null, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("contact_id", contactId).eq("status", "queued");
  if (ruleTypes?.length) query = query.in("automation_id", (await getSupabase().from("automations").select("id").eq("business_id", businessId).in("rule_type", ruleTypes)).data?.map((row) => row.id) ?? []);
  await query;
}

export async function cancelAutomationForConversation(businessId: string, conversationId: string, reason: string) {
  const { data: conversation } = await getSupabase().from("conversations").select("phone").eq("id", conversationId).eq("business_id", businessId).maybeSingle();
  if (!conversation) return;
  const { data: contact } = await getSupabase().from("contacts").select("id").eq("business_id", businessId).eq("phone", conversation.phone).maybeSingle();
  if (contact) await cancelContactAutomationRuns(businessId, contact.id, reason);
}
