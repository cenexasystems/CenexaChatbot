import { getSupabase } from "@/lib/supabase";
import { sendWhatsAppTemplate, extractWamid } from "@/lib/whatsapp";
import { shouldAutoPauseCampaign } from "@/lib/campaigns";
import { isWithinQuietHours, automationRunTime } from "@/lib/automations";

const db = () => getSupabase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processCampaignQueue(limit = 10) {
  const supabase = db();
  const { data: recipients, error } = await supabase.rpc("claim_campaign_recipients", { p_limit: limit });
  if (error) throw error;
  let processed = 0;
  for (const recipient of recipients ?? []) {
    const [{ data: campaign }, { data: contact }, { data: business }] = await Promise.all([
      supabase.from("campaigns").select("id, business_id, template_id, status").eq("id", recipient.campaign_id).eq("business_id", recipient.business_id).maybeSingle(),
      supabase.from("contacts").select("id, opt_in_at, opt_out_at").eq("id", recipient.contact_id).eq("business_id", recipient.business_id).maybeSingle(),
      supabase.from("businesses").select("id, modules_enabled, campaign_sending_paused, campaign_daily_send_cap, phone_number_id, access_token").eq("id", recipient.business_id).maybeSingle(),
    ]);
    if (!campaign || !business) {
      await supabase.from("campaign_recipients").update({ status: "skipped", skip_reason: "Campaign or module is not active", locked_at: null }).eq("id", recipient.id);
      processed++; continue;
    }
    if (campaign.status === "paused" || business.modules_enabled?.campaigns !== true) {
      await supabase.from("campaign_recipients").update({ status: "queued", next_attempt_at: new Date(Date.now() + 60_000).toISOString(), locked_at: null }).eq("id", recipient.id);
      continue;
    }
    if (campaign.status !== "sending") {
      await supabase.from("campaign_recipients").update({ status: "skipped", skip_reason: "Campaign is not active", locked_at: null }).eq("id", recipient.id);
      processed++; continue;
    }
    if (business.campaign_sending_paused) {
      await supabase.from("campaign_recipients").update({ status: "queued", next_attempt_at: new Date(Date.now() + 60_000).toISOString(), locked_at: null }).eq("id", recipient.id);
      continue;
    }
    if (!contact?.opt_in_at || contact.opt_out_at) {
      await supabase.from("campaign_recipients").update({ status: "skipped", skip_reason: contact?.opt_out_at ? "Contact opted out" : "Consent not recorded", locked_at: null }).eq("id", recipient.id);
      processed++; continue;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabase.from("campaign_daily_usage").select("sent_count").eq("business_id", recipient.business_id).eq("usage_date", today).maybeSingle();
    if ((usage?.sent_count ?? 0) >= (business.campaign_daily_send_cap ?? 500)) {
      await supabase.from("campaign_recipients").update({ status: "queued", next_attempt_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), locked_at: null }).eq("id", recipient.id);
      continue;
    }
    const [{ data: template }, { data: token }] = await Promise.all([
      supabase.from("message_templates").select("name, language, category, body, status").eq("id", campaign.template_id).eq("business_id", recipient.business_id).maybeSingle(),
      supabase.from("businesses").select("waba_id").eq("id", recipient.business_id).maybeSingle(),
    ]);
    if (!template || template.status !== "approved" || !token?.waba_id || !business.phone_number_id || !business.access_token) {
      await supabase.from("campaign_recipients").update({ status: "failed", skip_reason: "Approved template or WhatsApp connection unavailable", locked_at: null }).eq("id", recipient.id);
      processed++; continue;
    }
    if (template.category === "MARKETING" && !contact.opt_in_at) {
      await supabase.from("campaign_recipients").update({ status: "skipped", skip_reason: "Marketing consent not recorded", locked_at: null }).eq("id", recipient.id);
      processed++; continue;
    }
    const { data: claimedSlot } = await supabase.rpc("consume_campaign_daily_slot", { p_business_id: recipient.business_id, p_usage_date: today, p_cap: business.campaign_daily_send_cap ?? 500 });
    if (!claimedSlot) {
      await supabase.from("campaign_recipients").update({ status: "queued", next_attempt_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), locked_at: null }).eq("id", recipient.id);
      continue;
    }
    const values = Array.isArray(recipient.variables) ? recipient.variables.map(String) : [];
    const result = await sendWhatsAppTemplate(recipient.phone, template.name, template.language, values, { phoneNumberId: business.phone_number_id, accessToken: business.access_token });
    const wamid = extractWamid(result);
    const graphError = (result as { error?: { message?: string; code?: number } } | null)?.error;
    if (graphError || !wamid) {
      const { count: failures } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "failed");
      const { count: sent } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["sent", "delivered", "read", "replied", "paid"]);
      await supabase.from("campaign_recipients").update({ status: "failed", error_code: String(graphError?.code ?? "send_error"), skip_reason: graphError?.message ?? "Meta did not return a message ID", locked_at: null }).eq("id", recipient.id);
      if (shouldAutoPauseCampaign(sent ?? 0, (failures ?? 0) + 1)) await supabase.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campaign.id);
    } else {
      await supabase.from("campaign_recipients").update({ status: "sent", meta_message_id: wamid, sent_at: new Date().toISOString(), locked_at: null }).eq("id", recipient.id);
    }
    processed++;
    await sleep(200);
  }
  const { data: active } = await supabase.from("campaigns").select("id, business_id").eq("status", "sending");
  for (const campaign of active ?? []) {
    const { count } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["queued", "processing"]);
    if (!count) await supabase.from("campaigns").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaign.id);
  }
  return processed;
}

export async function processAutomationRuns(limit = 25) {
  const supabase = db();
  await queueFollowUps(supabase);
  const { data: runs, error } = await supabase.rpc("claim_automation_runs", { p_limit: limit });
  if (error) throw error;
  let processed = 0;
  for (const run of runs ?? []) {
    const [{ data: rule }, { data: contact }, { data: business }] = await Promise.all([
      supabase.from("automations").select("rule_type, enabled, config").eq("id", run.automation_id).eq("business_id", run.business_id).maybeSingle(),
      supabase.from("contacts").select("id, phone, name, opt_in_at, opt_out_at, conversation_id").eq("id", run.contact_id).eq("business_id", run.business_id).maybeSingle(),
      supabase.from("businesses").select("modules_enabled, phone_number_id, access_token").eq("id", run.business_id).maybeSingle(),
    ]);
    const skip = async (reason: string, status = "skipped") => { await supabase.from("automation_runs").update({ status, reason, locked_at: null, updated_at: new Date().toISOString() }).eq("id", run.id); };
    if (business?.modules_enabled?.automations !== true) {
      await supabase.from("automation_runs").update({ status: "queued", run_at: new Date(Date.now() + 5 * 60_000).toISOString(), reason: "Module disabled", locked_at: null }).eq("id", run.id);
      continue;
    }
    if (!business || !rule?.enabled) { await skip("Automation rule is disabled", "cancelled"); processed++; continue; }
    if (!contact?.opt_in_at || contact.opt_out_at) { await skip(contact?.opt_out_at ? "Contact opted out" : "Consent not recorded"); processed++; continue; }
    const config = rule.config ?? {};
    const quiet = { start: config.quiet_hours_start ?? "21:00", end: config.quiet_hours_end ?? "09:00", timeZone: "Asia/Kolkata" };
    const now = new Date();
    if (isWithinQuietHours(now, quiet)) {
      const runAt = automationRunTime(now, 0, quiet, now);
      await supabase.from("automation_runs").update({ status: "queued", run_at: runAt.toISOString(), locked_at: null, reason: "Rescheduled for quiet hours" }).eq("id", run.id); continue;
    }
    const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const localDate = `${dateParts.find((part) => part.type === "year")?.value}-${dateParts.find((part) => part.type === "month")?.value}-${dateParts.find((part) => part.type === "day")?.value}`;
    const dayStart = new Date(`${localDate}T00:00:00+05:30`);
    const { count: sentToday } = await supabase.from("automation_runs").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).eq("status", "sent").gte("updated_at", dayStart.toISOString());
    if ((sentToday ?? 0) > 0) { await skip("One automated message already sent to this contact today"); processed++; continue; }
    let { data: conversation } = run.conversation_id ? await supabase.from("conversations").select("id, phone, mode, payment_status, payment_qr_sent").eq("id", run.conversation_id).eq("business_id", run.business_id).maybeSingle() : { data: null };
    if (!conversation) ({ data: conversation } = await supabase.from("conversations").select("id, phone, mode, payment_status, payment_qr_sent").eq("business_id", run.business_id).eq("phone", contact.phone).maybeSingle());
    if (!conversation || conversation.mode === "human") { await skip("A team member took over", "cancelled"); processed++; continue; }
    if (rule.rule_type === "payment_reminder" && (!conversation.payment_qr_sent || conversation.payment_status !== "none")) { await skip("No outstanding QR payment", "cancelled"); processed++; continue; }
    if (rule.rule_type === "review_request" && conversation.payment_status !== "verified") { await skip("Payment is not verified", "cancelled"); processed++; continue; }
    const { data: lastInbound } = await supabase.from("messages").select("created_at").eq("conversation_id", conversation.id).eq("role", "user").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const withinWindow = Boolean(lastInbound && now.getTime() - new Date(lastInbound.created_at).getTime() < 24 * 60 * 60_000);
    let sent: unknown;
    let messageText = typeof config.message === "string" ? config.message : "";
    let approvedTemplate: { name: string; language: string; body: string } | null = null;
    if (!(withinWindow && messageText) && config.template_id) {
      const { data: template } = await supabase.from("message_templates").select("name, language, body, status").eq("id", config.template_id).eq("business_id", run.business_id).maybeSingle();
      if (template?.status === "approved") approvedTemplate = template;
    }
    if (!(withinWindow && messageText) && !approvedTemplate) { await skip("Outside the 24-hour window or no approved template is configured"); processed++; continue; }
    const { data: dailySlot } = await supabase.rpc("consume_automation_daily_slot", { p_contact_id: contact.id, p_usage_date: localDate });
    if (!dailySlot) { await skip("One automated message already sent to this contact today"); processed++; continue; }
    if (withinWindow && messageText) {
      const { sendWhatsAppMessage } = await import("@/lib/whatsapp");
      sent = await sendWhatsAppMessage(contact.phone, messageText.replaceAll("{{name}}", contact.name ?? ""), { phoneNumberId: business.phone_number_id, accessToken: business.access_token });
    } else if (approvedTemplate) {
      const values = [contact.name ?? "there"];
      sent = await sendWhatsAppTemplate(contact.phone, approvedTemplate.name, approvedTemplate.language, values, { phoneNumberId: business.phone_number_id, accessToken: business.access_token });
      messageText = approvedTemplate.body.replace(/\{\{(\d+)\}\}/g, (_m: string, n: string) => values[Number(n) - 1] ?? "");
    }
    const messageResult = sent as { error?: { message?: string } } | null;
    if (messageResult?.error || !sent) { await skip(messageResult?.error?.message ?? "Outside the customer window and no approved template is configured"); processed++; continue; }
    const wamid = extractWamid(sent);
    const { error: messageError } = await supabase.from("messages").insert({ conversation_id: conversation.id, role: "assistant", source: "automation", content: messageText, whatsapp_msg_id: wamid });
    if (messageError) { await skip("Sent, but could not save the chat message"); processed++; continue; }
    await supabase.from("automation_runs").update({ status: "sent", reason: null, meta_message_id: wamid, locked_at: null, updated_at: new Date().toISOString() }).eq("id", run.id);
    processed++;
  }
  return processed;
}

async function queueFollowUps(supabase: ReturnType<typeof getSupabase>) {
  const { data: rules } = await supabase.from("automations").select("id,business_id,config").eq("rule_type", "follow_up").eq("enabled", true);
  for (const rule of rules ?? []) {
    const { data: business } = await supabase.from("businesses").select("modules_enabled").eq("id", rule.business_id).maybeSingle();
    if (business?.modules_enabled?.automations !== true) continue;
    const delay = Number(rule.config?.delay_minutes ?? 1440);
    const cutoff = new Date(Date.now() - delay * 60_000).toISOString();
    const { data: conversations } = await supabase.from("conversations").select("id,phone").eq("business_id", rule.business_id).eq("mode", "agent").lt("updated_at", cutoff).limit(100);
    for (const conversation of conversations ?? []) {
      const { data: latest } = await supabase.from("messages").select("id,role,created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!latest || latest.role !== "user") continue;
      const { data: contact } = await supabase.from("contacts").select("id,opt_out_at,opt_in_at").eq("business_id", rule.business_id).eq("phone", conversation.phone).maybeSingle();
      if (!contact || !contact.opt_in_at || contact.opt_out_at) continue;
      const at = automationRunTime(new Date(latest.created_at), delay, { start: rule.config?.quiet_hours_start ?? "21:00", end: rule.config?.quiet_hours_end ?? "09:00" });
      if (at > new Date()) continue;
      await supabase.from("automation_runs").upsert({ business_id: rule.business_id, automation_id: rule.id, contact_id: contact.id, conversation_id: conversation.id, trigger_event_key: `follow-up:${latest.id}`, run_at: new Date().toISOString() }, { onConflict: "automation_id,trigger_event_key", ignoreDuplicates: true });
    }
  }
}
