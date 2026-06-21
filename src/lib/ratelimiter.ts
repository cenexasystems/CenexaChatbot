import { supabase } from "@/lib/supabase"

const LIMITS = {
    hour: 30,
    day: 100,
    month: 1000,
}

const LIMIT_MESSAGES = {
    hour: "You've sent quite a few messages this hour! Give it a little while and message us again. For urgent help call +91 99949 81576 📞",
    day: "You've reached today's message limit. Our team is always available at +91 99949 81576 or cenexasystems@gmail.com 😊",
    month: "Monthly limit reached! Please contact us directly at +91 99949 81576 — we'd love to help you. 🙏",
}

export async function checkAndUpdateRateLimit(conversationId: string, conversation: any): Promise<{ allowed: boolean; message?: string }> {
    const now = new Date()

    const hourlyCount = (now.getTime() - new Date(conversation.hour_reset_at).getTime()) > 3600000
        ? 0 : (conversation.msg_count_hour ?? 0)

    const dailyCount = (now.getTime() - new Date(conversation.day_reset_at).getTime()) > 86400000
        ? 0 : (conversation.msg_count_day ?? 0)

    const monthlyCount = (now.getTime() - new Date(conversation.month_reset_at).getTime()) > 2592000000
        ? 0 : (conversation.msg_count_month ?? 0)

    if (hourlyCount >= LIMITS.hour) return { allowed: false, message: LIMIT_MESSAGES.hour }
    if (dailyCount >= LIMITS.day) return { allowed: false, message: LIMIT_MESSAGES.day }
    if (monthlyCount >= LIMITS.month) return { allowed: false, message: LIMIT_MESSAGES.month }

    await supabase.from("conversations").update({
        msg_count_hour: hourlyCount + 1,
        msg_count_day: dailyCount + 1,
        msg_count_month: monthlyCount + 1,
        hour_reset_at: hourlyCount === 0 ? now.toISOString() : conversation.hour_reset_at,
        day_reset_at: dailyCount === 0 ? now.toISOString() : conversation.day_reset_at,
        month_reset_at: monthlyCount === 0 ? now.toISOString() : conversation.month_reset_at,
    }).eq("id", conversationId)

    return { allowed: true }
}