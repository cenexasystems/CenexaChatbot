import OpenAI from "openai"
import { SYSTEM_PROMPT } from "@/lib/system-prompt"

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
})

const FALLBACK_REPLIES = [
  "Sorry, I'm having a small technical issue right now! Please try again in a moment, or call us directly at +91 99949 81576. 🙏",
  "Oops, something went wrong on my end! Our team is always available at +91 99949 81576 or cenexasystems@gmail.com 😊",
  "I ran into a quick issue there! Give me a moment — or reach us directly at +91 99949 81576 for immediate help. 📞",
]

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<{ reply: string; error: boolean }> {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL ?? "openai/gpt-4o-mini",
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 300,
      temperature: 0.7,
    })

    const reply = completion.choices[0]?.message?.content ?? ""

    if (!reply || reply.trim().length < 3) {
      const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)]
      return { reply: fallback, error: true }
    }

    return { reply: reply.trim(), error: false }

  } catch (err: any) {
    console.error("AI Error:", err?.message ?? err)
    const fallback = FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)]
    return { reply: fallback, error: true }
  }
}