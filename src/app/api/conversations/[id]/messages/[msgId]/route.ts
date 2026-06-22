import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const { id, msgId } = await params;

  // Note: Meta's WhatsApp Cloud API does not support deleting messages from the user's device
  // ("Delete for everyone"). This only deletes the message from the dashboard's database ("Delete for me").
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", msgId)
    .eq("conversation_id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
