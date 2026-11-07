import { NextRequest } from "next/server";
import { requireBusinessAccess } from "@/lib/api-auth";
import { getAIResponse } from "@/lib/ai";
import { appendHandoffRules, rewriteConfiguredUrls } from "@/lib/assistant-config";

type TestMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, role, admin } = access;
  if (role !== "admin") return Response.json({ error: "Only a business admin can run assistant tests" }, { status: 403 });

  let messages: TestMessage[];
  try {
    const body = await request.json();
    messages = body.messages;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12) {
    return Response.json({ error: "Send between 1 and 12 test messages" }, { status: 400 });
  }
  if (messages.some((item) => !item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string" || item.content.trim().length === 0 || item.content.length > 2_000)) {
    return Response.json({ error: "Test messages must have a role and contain at most 2000 characters" }, { status: 400 });
  }
  if (messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "The last test message must be from you" }, { status: 400 });
  }

  const { data: business, error } = await admin
    .from("businesses")
    .select("system_prompt, handoff_rules, url_rewrite_from, url_rewrite_to, openrouter_api_key, ai_model, media_ai_enabled")
    .eq("id", businessId)
    .maybeSingle();
  if (error) return Response.json({ error: "Unable to load assistant configuration" }, { status: 500 });
  if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

  const prompt = appendHandoffRules(
    rewriteConfiguredUrls(business.system_prompt, business.url_rewrite_from, business.url_rewrite_to),
    business.handoff_rules
  );
  const result = await getAIResponse(
    messages.map((message) => ({ role: message.role, content: message.content.trim() })),
    prompt,
    business.openrouter_api_key ?? undefined,
    business.ai_model ?? undefined,
    business.media_ai_enabled === true
  );
  return Response.json(result);
}
