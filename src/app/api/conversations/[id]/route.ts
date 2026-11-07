import { NextRequest } from "next/server";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const allowed = ["mode", "assigned_to", "tags", "payment_status", "internal_note", "ai_paused_until"];
  const update: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  // ai_paused_until: null resumes the AI; otherwise must be a valid timestamp.
  if ("ai_paused_until" in body && body.ai_paused_until !== null && isNaN(Date.parse(body.ai_paused_until))) {
    return Response.json({ error: "Invalid ai_paused_until" }, { status: 400 });
  }

  if (body.mode && !["agent", "human"].includes(body.mode)) {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }

  if (
    body.payment_status &&
    !["none", "pending", "verified", "rejected"].includes(body.payment_status)
  ) {
    return Response.json({ error: "Invalid payment_status" }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, admin } = access;

  const { conversation, error: conversationError } = await getOwnedConversation(admin, businessId, id, "id");
  if (conversationError) {
    return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  }
  if (!conversation) return conversationNotFound();

  const { data, error } = await admin
    .from("conversations")
    .update(update)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) return conversationNotFound();

  return Response.json(data);
}
