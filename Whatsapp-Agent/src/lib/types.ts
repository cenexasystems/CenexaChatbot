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
  qr_image_url: string | null;
  plan: "basic" | "pro" | "enterprise";
  is_active: boolean;
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
  payment_qr_sent: boolean;
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
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
  last_message_type: string | null;
}

