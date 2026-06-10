import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

const FALLBACK_REPLIES = [
  "Sorry, I'm having a small technical issue right now! Please try again in a moment. 🙏",
  "Oops, something went wrong on my end! Our team is always available. 😊",
  "I ran into a quick issue there! Give me a moment for immediate help. 📞",
];

// Instructions for handling media messages correctly
const MEDIA_INSTRUCTIONS = `
IMPORTANT RULES FOR MEDIA:
- If the user sends "[image]", reply with: "Thank you for sending! We have received your image and our team will get back to you shortly."
- If the user sends "[Payment Screenshot]", reply with: "Thank you for the screenshot! Our team will verify your payment shortly."
- If the user sends "[audio]" or "[video]", reply with: "Thank you for sharing your file. We've received it and our team will take a look shortly."
- If the user sends "[document]", reply with: "Thank you for sending the document! Our team will review it and get back to you shortly."
- NEVER ask the user to summarize a document or image.
`;

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

    // Only append MEDIA_INSTRUCTIONS - website links and payment details must come from each business's system prompt in Supabase
    const finalSystemPrompt = (systemPromptOverride ?? SYSTEM_PROMPT) + "\n\n" + MEDIA_INSTRUCTIONS;

    const completion = await openai.chat.completions.create({
      model: modelOverride ?? process.env.AI_MODEL ?? "openai/gpt-4o-mini",
      messages: [
        { role: "system" as const, content: finalSystemPrompt },
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
