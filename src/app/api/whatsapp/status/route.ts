import { requireBusinessAccess } from "@/lib/api-auth";
import { getPhoneCoexistenceStatus } from "@/lib/coexistence";

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;

  const { data: business, error } = await access.admin
    .from("businesses")
    .select("name, whatsapp_number, is_active, onboarding_type, coexistence_enabled, coexistence_synced_at, disconnected_reason, access_token, phone_number_id")
    .eq("id", access.businessId)
    .maybeSingle();

  if (error) return Response.json({ error: "Unable to load WhatsApp connection" }, { status: 500 });
  if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

  let phoneLinked = Boolean(business.phone_number_id);
  if (business.is_active && business.onboarding_type === "coexistence" && business.access_token && business.phone_number_id) {
    const status = await getPhoneCoexistenceStatus(business.phone_number_id, business.access_token);
    phoneLinked = status.ok && status.isOnBizApp && status.platformType === "CLOUD_API";
  }

  const { data: conversations } = await access.admin
    .from("conversations")
    .select("ai_paused_until")
    .eq("business_id", access.businessId)
    .not("ai_paused_until", "is", null);
  const aiPaused = (conversations ?? []).some((item) => item.ai_paused_until && Date.parse(item.ai_paused_until) > Date.now());

  return Response.json({
    connection: {
      name: business.name,
      phoneNumber: business.whatsapp_number,
      active: business.is_active,
      onboardingType: business.onboarding_type,
      coexistenceEnabled: business.coexistence_enabled,
      syncedAt: business.coexistence_synced_at,
      disconnectedReason: business.disconnected_reason,
      phoneLinked,
      aiPaused,
    },
  });
}
