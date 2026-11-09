import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { matchesFilter, parseFilter } from "@/lib/inbox";
import type { ConversationWithLastMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const url = new URL(request.url);
  const rpc = access.admin.rpc.bind(access.admin) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("get_business_conversation_summaries", { p_business_id: access.businessId });
  if (error) return Response.json({ error: "Unable to load inbox summaries. Apply the ChatFlow experience migration before deploying this version." }, { status: 503 });
  const conversations = (Array.isArray(data) ? data : []) as ConversationWithLastMessage[];

  if (url.searchParams.get("format") === "csv") {
    const denied = requirePermission(access, "conversation_export");
    if (denied) return denied;
    const filter = parseFilter(url.searchParams.get("filter"));
    const mine = url.searchParams.get("mine") === "1";
    const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
    const digits = query.replace(/\D/g, "");
    const now = Date.now();
    const rows = conversations.filter((conversation) => {
      const matchesQuery = !query || conversation.name?.toLocaleLowerCase().includes(query) || (digits && conversation.phone.includes(digits)) || conversation.last_message?.toLocaleLowerCase().includes(query) || conversation.tags?.some((tag) => tag.toLocaleLowerCase().includes(query));
      return matchesFilter(conversation, filter, now) && (!mine || conversation.assigned_to === access.userId) && Boolean(matchesQuery);
    });
    const headers = ["name","phone","status","mode","payment_status","assigned_to","last_message_role","last_message_source","last_message","last_inbound_at","updated_at","tags"];
    const lines = rows.map((conversation) => csvRow([
      conversation.name,
      conversation.phone,
      chatStatus(conversation, now),
      conversation.mode,
      conversation.payment_status,
      conversation.assigned_to,
      conversation.last_message_role,
      conversation.last_message_source,
      conversation.last_message,
      conversation.last_inbound_at,
      conversation.updated_at,
      (conversation.tags ?? []).join("|"),
    ]));
    return new Response(`\uFEFF${csvRow(headers)}\r\n${lines.length ? `${lines.join("\r\n")}\r\n` : ""}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="chatflow-chats-${filter}${mine ? "-mine" : ""}.csv"`, "Cache-Control": "private, no-store" },
    });
  }
  return Response.json(conversations);
}

function chatStatus(conversation: ConversationWithLastMessage, now: number): string {
  if (conversation.payment_status === "pending") return "verify_payment";
  if (matchesFilter(conversation, "needs-you", now)) return "needs_reply";
  if (matchesFilter(conversation, "waiting-payment", now)) return "awaiting_payment";
  if (conversation.mode === "human") return "manual";
  if (matchesFilter(conversation, "ai", now)) return "ai_active";
  return conversation.payment_status ?? "open";
}

function csvRow(values: unknown[]): string {
  return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
}
