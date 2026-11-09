# Cenexa ChatFlow — Legacy Webhook Baseline Behaviour Spec

> **Purpose:** This document captures the exact expected behaviour of the webhook
> for a business with `media_ai_enabled = false` AND `coexistence_enabled = false`
> (all existing businesses before Phase 2 ships). These scenarios become regression
> tests in Phase 3 — if any of them change, that is a bug.
>
> All scenarios assume: `incomingPhoneNumberId` resolves to a known, active business.

---

## Shared Pre-conditions

- Business row: `is_active = true`, `media_ai_enabled = false`, `coexistence_enabled = false`
- No `.env` variables for transcription (`TRANSCRIBE_API_KEY` absent)
- `VISION_MODEL` env absent (or irrelevant — flag is off)
- `META_APP_SIGNATURE_MODE = off` (default)

---

## Scenario A — Text message from returning customer

**Input (Meta POST body)**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{ "changes": [{ "field": "messages", "value": {
    "metadata": { "phone_number_id": "TEST_PHONE_ID" },
    "contacts": [{ "profile": { "name": "Priya" } }],
    "messages": [{ "id": "wamid.AAA", "type": "text", "from": "919876543210",
                   "text": { "body": "What are your timings?" } }]
  }}]}]
}
```

**Expected behaviour**
1. HTTP 200 returned immediately (`{ "status": "replied" }`)
2. `conversations` row: found or created for `phone=919876543210`, `business_id=<biz>`; `name` updated to `"Priya"` if different; `is_first_message = false` (returning customer)
3. `messages` insert: `role=user`, `content="What are your timings?"`, `whatsapp_msg_id="wamid.AAA"`, `media_url=null`, `media_type=null`
4. Rate limit check: passes (count < limits)
5. `getAIResponse()` called with: last ≤20 messages history, business `system_prompt`, business `openrouter_api_key`, business `ai_model`, **exact legacy `GLOBAL_INSTRUCTIONS` text**
6. `sendWhatsAppMessage()` called with AI reply; markdown links converted to `"text: url"`
7. `messages` insert: `role=assistant`, `content=<ai reply>`
8. `conversations` update: `updated_at = now()`
9. **No** transcription or vision API calls made
10. **No** `ai_paused_until` check

**DB writes summary:** 1 message (user) + 1 message (assistant) + conversations timestamp update

---

## Scenario B — Image without caption

**Input**
```json
{ "messages": [{ "id": "wamid.BBB", "type": "image", "from": "919876543210",
  "image": { "id": "media_id_123", "mime_type": "image/jpeg" } }] }
```
*(no `caption` field)*

**Expected behaviour**
1. `text` variable = `"[image]"` (the `[${msgType}]` template)
2. Media download + Supabase storage upload attempted (because `businessAccessToken` is set)
3. `isPaymentScreenshot = false` (unless `conversation.payment_qr_sent = true`)
4. `messages` insert: `role=user`, `content="[image]"`, `media_type="image"`, `media_url=<public URL>`
5. **Branch: `mediaType && text === "[image]"`** → canned reply path
6. `sendWhatsAppMessage()` called with: `"Thank you for sending! 📩 We have received your image. Our team will get back to you shortly 💛"`
7. `messages` insert: `role=assistant`, `content=<canned reply>`
8. Return `{ "status": "replied_media_auto" }`
9. **No** AI call (`getAIResponse` never called)
10. **No** vision/transcription API calls

---

## Scenario C — Audio / voice note (no transcription configured)

**Input**
```json
{ "messages": [{ "id": "wamid.CCC", "type": "audio", "from": "919876543210",
  "audio": { "id": "media_id_456" } }] }
```

**Expected behaviour**
1. `text` = `"[audio]"`
2. Media stored to Supabase bucket
3. Canned reply: `"Thank you for your voice note! 🎤 Our team will listen and get back to you shortly 💛"`
4. Return `{ "status": "replied_media_auto" }`
5. **No** transcription API call (flag is off; `TRANSCRIBE_API_KEY` absent)
6. **No** AI call

---

## Scenario D — Video without caption

**Input:** type = `"video"`, no caption

**Expected behaviour**
1. `text` = `"[video]"`
2. Media stored
3. Canned reply: `"Thank you for the video! 🎥 Our team will take a look and get back to you shortly 💛"`
4. Return `{ "status": "replied_media_auto" }`
5. No AI call, no vision call

---

## Scenario E — First-ever message ("Hi")

**Input:** text message `"Hi"` with `conversation.is_first_message = true`

**Expected behaviour**
1. `messages` insert: `role=user`, `content="Hi"`, `whatsapp_msg_id=...`
2. Welcome message sent: value of `business.welcome_message` (URL-rewritten for b2 client), or fallback `"Hey! 👋 I'm your AI assistant. How can I help you today? 😊"`
3. `messages` insert: `role=assistant`, `content=<welcome message>`
4. `conversations` update: `is_first_message=false`, `msg_count_hour=1`, `msg_count_day=1`, `msg_count_month=1`
5. `text.trim()` matches `/^(hi|hello|hey|…)$/i` → **return early; no AI call**
6. Return `{ "success": true }`

**First-ever message with substantive content (e.g. "Hi, I need bridal makeup for Jan 15")**
1–4 same as above
5. Does NOT match greeting regex → **falls through to AI reply**
6. `getAIResponse()` called, AI reply sent and stored

---

## Scenario F — Conversation in human mode (`mode = "human"`)

**Input:** any text message, `conversation.mode = "human"`

**Expected behaviour**
1. Message stored: `role=user`, `content=<text>`, `whatsapp_msg_id=...`
2. `conversations` updated: `updated_at = now()`
3. **No** AI call, **no** WhatsApp send
4. Return `{ "status": "stored_for_human" }`

---

## Scenario G — Duplicate wamid (Meta retry)

**Input:** same payload as any previous scenario, same `message.id` value

**Expected behaviour**
1. `messages` insert attempted → Postgres unique violation `code = "23505"` on `whatsapp_msg_id`
2. Return `{ "status": "duplicate" }`
3. **No** AI call, **no** WhatsApp send, **no** additional DB writes

---

## Scenario H — Echo event (smb_message_echoes) — coexistence_enabled = false

**Input:** POST body with `change.field = "smb_message_echoes"`

**Expected behaviour (flag-off businesses)**
1. Event routed to `smb_message_echoes` handler
2. Business resolved by `phone_number_id`
3. Because `coexistence_enabled = false`: **handler is a no-op / logs only**
4. HTTP 200 returned
5. **No** conversation created/updated, **no** message stored, **no** AI reply

---

## Scenario I — History event — coexistence_enabled = false

**Input:** POST body with `change.field = "history"`

**Expected behaviour (flag-off businesses)**
1. Handler resolves business
2. Because `coexistence_enabled = false`: **no-op**
3. HTTP 200, nothing written to DB

---

## Scenario J — Unsupported message type (e.g. reaction, location)

**Input:** `message.type = "reaction"`

**Expected behaviour**
1. Falls to `else` branch in type detection
2. Returns `{ "status": "unsupported_type" }` (HTTP 200)
3. Nothing stored, no reply

---

## Scenario K — Payment screenshot (QR was sent)

**Input:** image message, `conversation.payment_qr_sent = true`, no caption

**Expected behaviour**
1. `isPaymentScreenshot = true`
2. `conversations` update: `payment_status = "pending"`, `payment_qr_sent = false`
3. `messages` insert: `content = "[Payment Screenshot]"`, `is_payment_screenshot = true`
4. Canned reply: `"Thank you for the payment screenshot! 🙏 Our team will verify and confirm shortly 💛"`
5. No AI call, no vision analysis

---

## Invariants (must hold for ALL flag-off scenarios)

- `GLOBAL_INSTRUCTIONS` sent to AI must be byte-for-byte the legacy text (not the new media-AI instructions)
- `getAIResponse()` is never called when `mediaType && text === "[${msgType}]"` (bare media)
- `analyzeVoiceNote()` and `analyzeImage()` are **never** imported or called
- `ai_paused_until` column is never read or written
- echo/history change fields are ignored (no DB writes)
- `source` column may be written (it has a safe default) but old code that doesn't write it still works because the column is nullable

---

## URL-rewrite invariant (b2 bridal studio client)

For the business whose `system_prompt` or `welcome_message` contains `https://b2-bridal-studio-upgraded.vercel.app`:

- All occurrences must be replaced with `https://b2bridalstudio.com` before being passed to the AI or sent as a welcome message
- This rewrite must occur for flag-off AND flag-on paths

---

*This spec was generated during Phase 0 (2026-10-13). Update after any intentional behaviour change.*
## Scenario L: Contacts module is opt-in per business

With `businesses.modules_enabled.contacts` missing or false, inbound webhook
handling does not create contacts or activity events, and the existing
conversation/message path remains active. With the flag true, the contact is
created once per `(business_id, phone)` and an exact `STOP`/`UNSUBSCRIBE`
message records opt-out without triggering an AI reply.

## Phase 3 and 4 invariants: campaigns and automations

- Campaign recipients must have recorded opt-in and no opt-out timestamp; the
  campaign must use a business-owned approved template.
- Campaign sends obey the tenant emergency pause and daily cap. Pricing
  estimates require configured country/category rates and show their `as_of`
  date; they do not represent a charge.
- Campaign sends and automation sends do not create a customer chat message.
  An automation message is stored with `source = 'automation'` only after the
  send succeeds.
- Automation sends skip opted-out contacts, obey Asia/Kolkata quiet hours and
  the WhatsApp 24-hour window, use an approved template outside that window,
  and reserve at most one send per contact per local day.
- Customer replies, payment verification, and human takeover cancel queued
  automation runs. Payment reminders require an outstanding QR payment;
  review requests require verified payment.

## Phase 5 and 6 invariants: reports and team

- Reports are database-aggregated, scoped to the authenticated business, and
  available to admin/accounts only when the Reports module is enabled.
- Report dates use `owner_alert_timezone`. Payment and sales series start at
  `reporting_history_start_date`; older payment changes have no event history.
  CSV rows are returned from the same report query as the UI.
- Team routes are tenant-scoped. Invitations create profiles for Supabase Auth
  user IDs, invited profiles activate at first sign-in, and disabled profiles
  are rejected even if the browser retains an Auth session.
- A serialized database update prevents demoting or deactivating the final
  active admin. `strict_roles = false` retains legacy behavior; when enabled,
  routes and controls enforce the documented role matrix.
- Assignments use active profile IDs from the same business; the Mine filter
  shows chats assigned to the current user.

## Phase 7 and platform control-plane invariants

- With Integrations off, webhook behavior and contact attribution are unchanged.
- Tracked WhatsApp source attribution requires an exact per-business source-code
  match. If a customer edits out the prefilled source line, attribution is absent.
- Platform APIs require an enabled `platform_admins` record and an AAL2 MFA
  session. Tenant profiles alone never grant platform access.
- Read-only platform admins cannot write; support can change module flags only;
  owners can change tenant settings and platform-admin access.
- Every platform change requires an explicit confirmation and reason, and the
  update and append-only audit entry commit in one database transaction.
- Platform responses contain tenant metadata and counts only; they never return
  access tokens, provider API keys, or customer message bodies.
- A suspended tenant receives a clear app notice, tenant APIs reject access,
  and webhook processing skips that business.
