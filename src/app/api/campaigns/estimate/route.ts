import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { resolveCampaignAudience, estimateCampaignCost } from "@/lib/campaigns";

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "campaign_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "campaigns"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  let query = access.admin.from("contacts").select("id,phone,opt_in_at,opt_out_at", { count: "exact" }).eq("business_id", access.businessId).limit(5000);
  if (body.groupId) {
    const { data: group } = await access.admin.from("contact_groups").select("id").eq("business_id", access.businessId).eq("id", body.groupId).maybeSingle();
    if (!group) return Response.json({ error: "Contact group not found" }, { status: 404 });
    const { data: members } = await access.admin.from("contact_group_members").select("contact_id").eq("business_id", access.businessId).eq("group_id", group.id);
    const ids = (members ?? []).map((row) => row.contact_id); if (!ids.length) return Response.json({ count: 0, skipped: 0, totalInr: 0 });
    query = query.in("id", ids);
  }
  const { data: contacts, error, count } = await query;
  if (error) return Response.json({ error: "Unable to estimate audience" }, { status: 500 });
  if ((count ?? 0) > 5000) return Response.json({ error: "Campaign audiences are limited to 5,000 contacts" }, { status: 413 });
  const { eligible, skipped } = resolveCampaignAudience(contacts ?? []);
  if (!eligible.length) return Response.json({ count: 0, skipped: skipped.length, metaCostInr: 0, cenexaFeeInr: 0, totalInr: 0, currency: "INR", asOf: null });
  const category = body.category === "MARKETING" ? "MARKETING" : "UTILITY";
  const codes = [...new Set(eligible.map((contact) => contact.phone.startsWith("91") ? "91" : contact.phone.slice(0, 2)))];
  const { data: rates } = await access.admin.from("campaign_pricing").select("country_code,category,rate_inr,cenexa_fee_inr,as_of").in("country_code", codes).eq("category", category);
  const byCode = new Map((rates ?? []).map((rate) => [rate.country_code, rate]));
  if (codes.some((code) => !byCode.has(code))) return Response.json({ error: "Pricing is not configured for every destination country" }, { status: 409 });
  const total = eligible.reduce((sum, contact) => {
    const cost = estimateCampaignCost(1, byCode.get(contact.phone.startsWith("91") ? "91" : contact.phone.slice(0, 2))!);
    return { metaCostInr: sum.metaCostInr + cost.metaCostInr, cenexaFeeInr: sum.cenexaFeeInr + cost.cenexaFeeInr, totalInr: sum.totalInr + cost.totalInr };
  }, { metaCostInr: 0, cenexaFeeInr: 0, totalInr: 0 });
  return Response.json({ count: eligible.length, skipped: skipped.length, ...Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value * 100) / 100])), currency: "INR", asOf: rates?.[0]?.as_of ?? null });
}
