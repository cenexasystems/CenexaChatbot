import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, admin } = access;

  const { conversation, error: conversationError } = await getOwnedConversation(admin, businessId, id, "id");
  if (conversationError) {
    return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  }
  if (!conversation) return conversationNotFound();

  const rawLimit = Number(request.nextUrl.searchParams.get("limit")) || 100;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const before = request.nextUrl.searchParams.get("before");
  let query = admin.from("messages").select("*").eq("conversation_id", id)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (before) {
    const [createdAt, messageId] = before.split("|");
    if (!createdAt || !messageId || Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(messageId)) {
      return Response.json({ error: "Invalid message cursor" }, { status: 400 });
    }
    query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${messageId})`);
  }
  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse();
  const oldest = messages[0];
  return Response.json({ messages, hasMore, nextCursor: hasMore && oldest ? `${oldest.created_at}|${oldest.id}` : null });
}
