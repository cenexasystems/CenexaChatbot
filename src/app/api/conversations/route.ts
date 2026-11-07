import { requireBusinessAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, admin } = access;

  const { data: conversations, error } = await admin
    .from("conversations")
    .select("*")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Fetch last message for each conversation
  const withLastMessage = await Promise.all(
    (conversations || []).map(async (convo) => {
      const [{ data: messages }, { data: inbound }] = await Promise.all([
        admin
          .from("messages")
          .select("*")
          .eq("conversation_id", convo.id)
          .order("created_at", { ascending: false })
          .limit(1),
        // Latest customer message: drives the 24-hour reply-window timer.
        admin
          .from("messages")
          .select("created_at")
          .eq("conversation_id", convo.id)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const lastMsg = messages?.[0];
      return {
        ...convo,
        last_message: lastMsg?.content || null,
        last_message_type: lastMsg?.media_type || null,
        last_message_role: lastMsg?.role || null,
        // null on databases without the coexistence migration
        last_message_source: lastMsg?.source ?? null,
        last_inbound_at: inbound?.[0]?.created_at || null,
      };
    })
  );

  return Response.json(withLastMessage);
}
