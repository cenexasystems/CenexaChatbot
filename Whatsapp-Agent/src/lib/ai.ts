import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const completion = await openai.chat.completions.create({
    model: process.env.AI_MODEL ?? "openai/gpt-4o-mini",
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
  });

  return (
    completion.choices[0]?.message?.content ??
    "Sorry, I couldn't generate a response."
  );
}
