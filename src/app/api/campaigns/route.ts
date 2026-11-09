import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { resolveCampaignAudience, estimateCampaignCost } from "@/lib/campaigns";
import { templateVariableCount } from "@/lib/templates";

export async function GET() {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const { data, error } = await access.admin.from("campaigns").select("id,name,status,estimate,totals,created_at,scheduled_at").eq("business_id", access.businessId).order("created_at", { ascending: false });
  if (error) return Response.json({ error: "Unable to load campaigns" }, { status: 500 });
  return Response.json({ campaigns: data ?? [] });
}

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "campaign_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const variables = Array.isArray(body.variables) && body.variables.every((value: unknown) => typeof value === "string") ? body.variables as string[] : [];
  if (!name || !templateId) return Response.json({ error: "Campaign name and template are required" }, { status: 400 });
  const { data: template } = await access.admin.from("message_templates").select("id,name,language,category,body,status").eq("id", templateId).eq("business_id", access.businessId).maybeSingle();
  if (!template || template.status !== "approved") return Response.json({ error: "Choose an approved template from this business" }, { status: 400 });
  const expected = templateVariableCount(template.body);
  if (expected < 0 || variables.length !== expected || variables.some((value: string) => value.length > 1024)) return Response.json({ error: `Enter ${expected} template variable value(s)` }, { status: 400 });
  let candidateQuery = access.admin.from("contacts").select("id,phone,opt_in_at,opt_out_at,name", { count: "exact" }).eq("business_id", access.businessId).limit(5000);
  if (typeof body.groupId === "string" && body.groupId) {
    const { data: group } = await access.admin.from("contact_groups").select("id").eq("id", body.groupId).eq("business_id", access.businessId).maybeSingle();
    if (!group) return Response.json({ error: "Contact group not found" }, { status: 404 });
    const { data: members } = await access.admin.from("contact_group_members").select("contact_id").eq("business_id", access.businessId).eq("group_id", group.id);
    const ids = (members ?? []).map((item) => item.contact_id);
    if (!ids.length) return Response.json({ error: "This audience is empty" }, { status: 400 });
    candidateQuery = candidateQuery.in("id", ids);
  }
  const { data: contacts, error: contactError, count: contactCount } = await candidateQuery;
  if (contactError) return Response.json({ error: "Unable to resolve audience" }, { status: 500 });
  if ((contactCount ?? 0) > 5000) return Response.json({ error: "Campaign audiences are limited to 5,000 contacts" }, { status: 413 });
  const { eligible, skipped } = resolveCampaignAudience(contacts ?? []);
  if (!eligible.length) return Response.json({ error: "No opted-in contacts in this audience", skipped: skipped.length }, { status: 400 });
  const countryCodes = [...new Set(eligible.map((contact) => contact.phone.startsWith("91") ? "91" : contact.phone.slice(0, 2)))];
  const { data: rates } = await access.admin.from("campaign_pricing").select("country_code,category,rate_inr,cenexa_fee_inr,as_of").in("country_code", countryCodes).eq("category", template.category);
  const rateByCountry = new Map((rates ?? []).map((rate) => [rate.country_code, rate]));
  const missing = countryCodes.filter((code) => !rateByCountry.has(code));
  if (missing.length) return Response.json({ error: `No ${template.category.toLowerCase()} price configured for country codes: ${missing.join(", ")}` }, { status: 409 });
  const total = eligible.reduce((sum, contact) => {
    const rate = rateByCountry.get(contact.phone.startsWith("91") ? "91" : contact.phone.slice(0, 2))!;
    const partial = estimateCampaignCost(1, rate);
    return { metaCostInr: sum.metaCostInr + partial.metaCostInr, cenexaFeeInr: sum.cenexaFeeInr + partial.cenexaFeeInr, totalInr: sum.totalInr + partial.totalInr };
  }, { metaCostInr: 0, cenexaFeeInr: 0, totalInr: 0 });
  const estimate = { recipientCount: eligible.length, ...Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value * 100) / 100])), currency: "INR", asOf: rates?.[0]?.as_of };
  const { data: campaign, error } = await access.admin.from("campaigns").insert({ business_id: access.businessId, name, template_id: template.id, audience: { group_id: body.groupId ?? null }, estimate, totals: { skipped: skipped.length }, creator_id: access.userId }).select("*").single();
  if (error) return Response.json({ error: "Could not create campaign" }, { status: 500 });
  const rows = [
    ...eligible.map((contact) => ({ business_id: access.businessId, campaign_id: campaign.id, contact_id: contact.id, phone: contact.phone, variables, status: "queued" })),
    ...skipped.map(({ contact, reason }) => ({ business_id: access.businessId, campaign_id: campaign.id, contact_id: contact.id, phone: contact.phone, variables: [], status: "skipped", skip_reason: reason })),
  ];
  for (let offset = 0; offset < rows.length; offset += 250) {
    const { error: recipientError } = await access.admin.from("campaign_recipients").insert(rows.slice(offset, offset + 250));
    if (recipientError) return Response.json({ error: "Campaign created, but its audience could not be fully saved" }, { status: 500 });
  }
  return Response.json({ campaign, skipped: skipped.length }, { status: 201 });
}
