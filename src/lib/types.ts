export interface Business {
  id: string;
  name: string;
  phone_number_id: string;
  whatsapp_number: string | null;
  access_token: string;
  openrouter_api_key: string | null;
  ai_model: string;
  system_prompt: string | null;
  welcome_message: string | null;
  plan: "basic" | "pro" | "enterprise";
  is_active: boolean;
  qr_image_url: string | null;
  waba_id?: string | null;
  onboarding_type?: "api" | "coexistence";
  coexistence_synced_at?: string | null;
  disconnected_reason?: string | null;
  handoff_minutes?: number;
  vision_model?: string | null;
  coexistence_enabled?: boolean;
  media_ai_enabled?: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  business_id: string;
  name: string | null;
  role: "admin" | "support" | "sales" | "accounts";
  created_at: string;
}

export interface Conversation {
  id: string;
  business_id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  assigned_to: string | null;
  tags: string[];
  payment_status: "none" | "pending" | "verified" | "rejected";
  internal_note: string | null;
  updated_at: string;
  created_at: string;
  msg_count_hour: number;
  msg_count_day: number;
  msg_count_month: number;
  hour_reset_at: string;
  day_reset_at: string;
  month_reset_at: string;
  is_first_message: boolean;
  payment_qr_sent: boolean;
  ai_paused_until?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  media_url: string | null;
  media_type: "image" | "audio" | "document" | "video" | "sticker" | null;
  is_payment_screenshot: boolean;
  whatsapp_msg_id: string | null;
  source?: "customer" | "ai" | "dashboard" | "business_app" | "history" | null;
  transcript?: string | null;
  media_analysis?: Record<string, unknown> | null;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
  last_message_type: string | null;
  payment_qr_sent: boolean;
  last_message_date: string | null;
  /** Role of the latest message ("user" = customer). */
  last_message_role?: "user" | "assistant" | null;
  /** Source of the latest message (see Message.source). */
  last_message_source?: Message["source"];
  /** Time of the latest customer message; opens Meta's 24-hour reply window. */
  last_inbound_at?: string | null;
}
