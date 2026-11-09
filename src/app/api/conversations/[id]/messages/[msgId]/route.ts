import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess, requireStrictPermission } from "@/lib/api-auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const { id, msgId } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requireStrictPermission(access, "conversation_reply"); if (denied) return denied;
  const { businessId, admin } = access;
  const { conversation, error: conversationError } = await getOwnedConversation(admin, businessId, id, "id");
  if (conversationError) {
    return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  }
  if (!conversation) return conversationNotFound();

  // Note: Meta's WhatsApp Cloud API does not support deleting messages from the user's device
  // ("Delete for everyone"). This only deletes the message from the dashboard's database ("Delete for me").
  const { data, error } = await admin
    .from("messages")
    .delete()
    .eq("id", msgId)
    .eq("conversation_id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) return Response.json({ error: "Message not found" }, { status: 404 });

  return Response.json({ success: true });
}
