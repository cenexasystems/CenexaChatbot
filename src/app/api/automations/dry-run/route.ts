import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "automation_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "automations"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  if (!/^(follow_up|payment_reminder|review_request|dated_reminder)$/.test(body.ruleType)) return Response.json({ error: "Unknown rule" }, { status: 400 });
  const { data: rule } = await access.admin.from("automations").select("id,enabled,config").eq("business_id", access.businessId).eq("rule_type", body.ruleType).maybeSingle();
  if (!rule) return Response.json({ matches: [] });
  const query = access.admin.from("contacts").select("id,name,phone,opt_in_at,opt_out_at,conversation_id").eq("business_id", access.businessId).not("opt_in_at", "is", null).is("opt_out_at", null).limit(100);
  const { data: contacts } = await query;
  const matches = [];
  for (const contact of contacts ?? []) {
    let reason = rule.enabled ? "Would queue" : "Rule is off";
    let eligible = rule.enabled;
    if ((body.ruleType === "payment_reminder" || body.ruleType === "follow_up") && !contact.conversation_id) { reason = "No active conversation"; eligible = false; }
    if (body.ruleType === "payment_reminder") {
      const { data: convo } = await access.admin.from("conversations").select("payment_qr_sent,payment_status").eq("id", contact.conversation_id).eq("business_id", access.businessId).maybeSingle();
      if (!convo?.payment_qr_sent || convo.payment_status !== "none") { reason = "No outstanding QR payment"; eligible = false; }
    }
    if (body.ruleType === "review_request") {
      const { data: convo } = contact.conversation_id ? await access.admin.from("conversations").select("payment_status").eq("id", contact.conversation_id).eq("business_id", access.businessId).maybeSingle() : { data: null };
      if (convo?.payment_status !== "verified") { reason = "Payment not verified"; eligible = false; }
    }
    if (body.ruleType === "follow_up" && contact.conversation_id) {
      const { data: conversation } = await access.admin.from("conversations").select("mode").eq("id", contact.conversation_id).eq("business_id", access.businessId).maybeSingle();
      const { data: latest } = await access.admin.from("messages").select("role,source,created_at").eq("conversation_id", contact.conversation_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const due = new Date(Date.now() - Number(rule.config?.delay_minutes ?? 1440) * 60_000);
      if (conversation?.mode === "human" || latest?.role !== "user" || !latest || new Date(latest.created_at) > due) { reason = "No overdue unanswered customer message"; eligible = false; }
    }
    if (eligible) matches.push({ id: contact.id, name: contact.name, phone: contact.phone, reason });
  }
  return Response.json({ matches });
}
