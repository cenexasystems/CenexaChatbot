import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

const FALLBACK_REPLIES = [
  "Sorry, I'm having a small technical issue right now! Please try again in a moment, or call us directly at +91 99949 81576. 🙏",
  "Oops, something went wrong on my end! Our team is always available at +91 99949 81576 or cenexasystems@gmail.com 😊",
  "I ran into a quick issue there! Give me a moment — or reach us directly at +91 99949 81576 for immediate help. 📞",
];

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[],
  systemPromptOverride?: string,
  apiKeyOverride?: string,
  modelOverride?: string
): Promise<{ reply: string; error: boolean }> {
  try {
    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKeyOverride ?? process.env.OPENROUTER_API_KEY ?? "",
    });

    const completion = await openai.chat.completions.create({
      model: modelOverride ?? process.env.AI_MODEL ?? "openai/gpt-4o-mini",
      messages: [
        { role: "system" as const, content: systemPromptOverride ?? SYSTEM_PROMPT },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    if (!reply || reply.trim().length < 3) {
      return { reply: FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)], error: true };
    }
    return { reply: reply.trim(), error: false };
  } catch (err: unknown) {
    console.error("AI Error:", err instanceof Error ? err.message : err);
    return { reply: FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)], error: true };
  }
}