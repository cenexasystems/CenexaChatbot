import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("business_id");

  // Safety: never return all conversations without a business_id filter
  if (!businessId) {
    return Response.json([]);
  }

  const supabase = getSupabase();

  let query = supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  // Filter by business_id if provided
  if (businessId) {
    query = query.eq("business_id", businessId);
  }

  const { data: conversations, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Fetch last message for each conversation
  const withLastMessage = await Promise.all(
    (conversations || []).map(async (convo) => {
      const { data: messages } = await supabase
        .from("messages")
        .select("content, role, media_type, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMsg = messages?.[0];
      return {
        ...convo,
        last_message: lastMsg?.content || null,
        last_message_type: lastMsg?.media_type || null,
      };
    })
  );

  return Response.json(withLastMessage);
}
