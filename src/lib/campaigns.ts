export type CampaignRate = { country_code: string; category: string; rate_inr: number; cenexa_fee_inr: number; as_of: string };
export type CampaignContact = { id: string; phone: string; opt_in_at: string | null; opt_out_at: string | null };

export function resolveCampaignAudience(contacts: CampaignContact[]) {
  const eligible: CampaignContact[] = [];
  const skipped: Array<{ contact: CampaignContact; reason: string }> = [];
  for (const contact of contacts) {
    if (!contact.opt_in_at) skipped.push({ contact, reason: "Consent not recorded" });
    else if (contact.opt_out_at) skipped.push({ contact, reason: "Contact opted out" });
    else eligible.push(contact);
  }
  return { eligible, skipped };
}

export function estimateCampaignCost(count: number, rate: CampaignRate, cenexaFeeOverride?: number) {
  const meta = Math.max(0, count) * Number(rate.rate_inr);
  const fee = Math.max(0, count) * (cenexaFeeOverride ?? Number(rate.cenexa_fee_inr));
  return { recipientCount: Math.max(0, count), metaCostInr: round(meta), cenexaFeeInr: round(fee), totalInr: round(meta + fee), currency: "INR", asOf: rate.as_of };
}

function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function nextCampaignRecipientStatus(current: string, incoming: string): string {
  const rank: Record<string, number> = { queued: 0, processing: 0, sent: 1, delivered: 2, read: 3, replied: 4, paid: 5, failed: 1, skipped: 1 };
  return (rank[incoming] ?? -1) > (rank[current] ?? -1) ? incoming : current;
}

export function shouldAutoPauseCampaign(sent: number, failed: number) {
  const attempts = sent + failed;
  return attempts >= 20 && failed / Math.max(1, attempts) >= 0.2;
}
