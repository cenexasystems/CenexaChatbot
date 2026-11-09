# Before onboarding a real client

This checklist is for production. Payment integration is not part of this release.

## 1. Update the production database

1. Back up the production Supabase project.
2. In Supabase SQL Editor, apply every migration in `supabase/migrations/` that is not already applied, in date order.
3. Apply `20261109_tenant_realtime_rls.sql` before a second business is allowed to connect. It limits browser reads and Realtime messages to the signed-in user's business.
4. Sign in and confirm the inbox, contacts, AI settings, and messages still load.

Do not run `staging-schema.sql` against production; it is a database bootstrap script, not an incremental migration.

## 2. Set production app configuration

In Vercel, check the Production environment for the variables listed in `.env.example`. Keep secrets server-side. In particular:

- Set `META_APP_SECRET` and `META_APP_SIGNATURE_MODE=enforce`.
- Set `WHATSAPP_VERIFY_TOKEN` to the same value entered in Meta's webhook setup.
- Set the production Supabase URL, public key, and service-role key.
- Set the AI provider key and model if automatic replies are enabled.
- For push alerts, set the VAPID public/private keys, subject, and `CRON_SECRET`.
- Do not set a shared `WHATSAPP_REGISTER_PIN`. Each API-only client enters their own six-digit PIN during setup; coexistence clients leave it blank.

Redeploy Production after changing environment variables.

## 3. Check Meta settings

- The production webhook callback must be `https://cenexa-chatbot.vercel.app/api/webhook`.
- Its verify token must match `WHATSAPP_VERIFY_TOKEN`.
- Subscribe the app to the `messages` webhook field and subscribe each client's WhatsApp account to the app.
- Confirm the Meta app has the WhatsApp Embedded Signup configuration and permissions needed for the clients you plan to onboard.
- Use a Meta account that is allowed to use the app. If Meta still marks the app as in development/testing, only its allowed test users can connect.

## 4. Connect one client at a time

1. Create the client's login and have the client sign in.
2. Enter the business name and connect their WhatsApp account from `/onboard`.
3. For an API-only number, the number owner must enter their own WhatsApp two-step PIN. The app sends it to Meta during registration and does not save it.
4. The app must confirm Meta phone registration and webhook subscription before it marks the business connected.
5. Send a customer message to the connected number. Check that it appears in the correct business inbox and only that business's dashboard can see it.
6. Send a dashboard reply and confirm it arrives in WhatsApp.
7. Check Vercel logs for webhook processing errors.

The current self-service flow supports one WhatsApp phone number per business setup. If Meta returns more than one number, stop and contact support; the app will not guess which number to connect.

## Release gate

Do not onboard external businesses until the production migration is applied, Meta webhook signatures are enforced, and one complete inbound/outbound message cycle has been confirmed for the first client.
