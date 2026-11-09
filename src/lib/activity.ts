import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordContactActivity(admin: SupabaseClient, businessId: string, conversationId: string, eventType: string, details: Record<string, unknown> = {}) {
  const { data: business } = await admin.from("businesses").select("modules_enabled").eq("id", businessId).maybeSingle();
  if (business?.modules_enabled?.contacts !== true) return;
  const { data: contact } = await admin.from("contacts").select("id").eq("business_id", businessId).eq("conversation_id", conversationId).maybeSingle();
  if (!contact) return;
  await admin.from("activity_events").insert({ business_id: businessId, contact_id: contact.id, conversation_id: conversationId, event_type: eventType, details });
}
