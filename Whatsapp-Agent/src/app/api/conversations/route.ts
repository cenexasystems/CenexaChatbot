import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[/api/conversations] Supabase error:", error.message, error.code);
    return Response.json({ error: error.message, code: error.code }, { status: 500 });
  }

  if (!conversations || conversations.length === 0) {
    console.log("[/api/conversations] Returned 0 conversations (table may be empty or RLS blocking)");
    return Response.json([]);
  }

  // Fetch last message for each conversation
  const withLastMessage = await Promise.all(
    conversations.map(async (convo) => {
      const { data: messages } = await supabase
        .from("messages")
        .select("content, role, media_type, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMsg = messages?.[0];
      let displayText = lastMsg?.content || null;

      if (lastMsg?.media_type && (!lastMsg.content || lastMsg.content.startsWith("["))) {
        const labels: Record<string, string> = {
          image: "📷 Image",
          audio: "🎵 Audio",
          video: "🎥 Video",
          document: "📄 Document",
          sticker: "🩹 Sticker",
        };
        displayText = labels[lastMsg.media_type] ?? lastMsg.content;
      }

      return {
        ...convo,
        last_message: displayText,
        last_message_type: lastMsg?.media_type ?? null,
      };
    })
  );

  return Response.json(withLastMessage);
}
