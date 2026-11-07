import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
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

  const { data: messages, error } = await admin
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(messages);
}
