import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { GRAPH_BASE } from "@/lib/graph";
import { subscribeAppToWaba, getPhoneCoexistenceStatus, startCoexistenceSync } from "@/lib/coexistence";

/**
 * POST /api/onboard/callback
 */
export async function POST(request: NextRequest) {
  try {
    const { code, businessName, wabaId: clientWabaId } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
    }
    if (!businessName || !businessName.trim()) {
      return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    }

    // ── 1. Get the authenticated Supabase user ─────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // ── 2. Exchange code for access token ──────────────────────────────────
    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Meta app credentials not configured. Set META_APP_ID and META_APP_SECRET." },
        { status: 500 }
      );
    }

    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    // FB.login() JS SDK flow: redirect_uri MUST NOT be included.

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      console.error("[onboard/callback] Token exchange failed:", tokenData);
      return NextResponse.json(
        { error: tokenData?.error?.message ?? "Failed to exchange token with Meta" },
        { status: 400 }
      );
    }

    const accessToken: string = tokenData.access_token;

    // ── 3. Find WABA ID via debug_token endpoint ──────────────────────────
    const debugUrl = `${GRAPH_BASE}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();

    console.log("Debug token info:", JSON.stringify(debugData, null, 2));

    if (!debugRes.ok || debugData.error || !debugData.data) {
      console.error("[onboard/callback] Debug token failed:", debugData);
      return NextResponse.json(
        { error: debugData?.error?.message ?? "Failed to validate token permissions" },
        { status: 400 }
      );
    }

    // The signup event (WA_EMBEDDED_SIGNUP) gives us a waba_id, but never trust the browser:
    // only accept it if the token's granular scopes actually include it.
    const grantedWabaIds: string[] = [];
    for (const scope of debugData.data.granular_scopes ?? []) {
      if (scope.scope === "whatsapp_business_management") grantedWabaIds.push(...(scope.target_ids ?? []));
    }
    const wabaId: string | null =
      clientWabaId && grantedWabaIds.includes(String(clientWabaId)) ? String(clientWabaId) : grantedWabaIds[0] ?? null;

    if (!wabaId) {
      return NextResponse.json(
        { error: "No WhatsApp Business Account found in the token scopes. Did you complete the signup?" },
        { status: 400 }
      );
    }

    // ── 4. Fetch the phone number(s) for this WABA ────────────────────────
    // Coexistence numbers can take a few seconds to show up after signup, so retry.
    let phones: Array<{ id?: string; display_phone_number?: string; is_on_biz_app?: boolean; platform_type?: string }> = [];
    for (let attempt = 0; attempt < 4 && phones.length === 0; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(
        `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        console.error("[onboard/callback] WABA phone numbers fetch failed:", data);
        if (attempt === 3) {
          return NextResponse.json(
            { error: data?.error?.message ?? "Failed to fetch phone numbers for the account" },
            { status: 400 }
          );
        }
        continue;
      }
      phones = data.data ?? [];
    }

    // Prefer a number that is live on the Business app (coexistence), otherwise the first one.
    const phone = phones.find((p) => p.is_on_biz_app === true) ?? phones[0];
    const phoneNumberId: string | null = phone?.id ?? null;
    const whatsappNumber: string | null = phone?.display_phone_number ?? null;

    if (!phoneNumberId) {
      return NextResponse.json(
        { error: "No WhatsApp phone number found in your account. Please ensure you completed the signup and added a number." },
        { status: 400 }
      );
    }

    // Meta's own flag is the source of truth for which path this was.
    const status = await getPhoneCoexistenceStatus(phoneNumberId, accessToken);
    const isCoexistence = phone?.is_on_biz_app === true || status.isOnBizApp;

    // ── 5. Register (API-only numbers) — NEVER for coexistence ────────────
    // Coexistence numbers are already registered; calling /register would fight the Business app.
    if (!isCoexistence) {
      try {
        await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", pin: process.env.WHATSAPP_REGISTER_PIN ?? "000000" }),
        });
      } catch (regErr) {
        console.warn("[onboard/callback] Register step warning:", regErr);
      }
    }

    // Subscribe our app to this customer's WABA so webhooks (incl. smb_message_echoes) reach us.
    const sub = await subscribeAppToWaba(wabaId, accessToken);
    if (!sub.ok) console.error("[onboard/callback] subscribed_apps failed:", sub.data);

    // ── 6. Write to Supabase using the service role (bypasses RLS) ────────
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existingBusiness } = await adminClient
      .from("businesses")
      .select("id")
      .eq("phone_number_id", phoneNumberId)
      .single();

    let businessId: string;

    if (existingBusiness) {
      businessId = existingBusiness.id;
      await adminClient
        .from("businesses")
        .update({
          access_token: accessToken,
          is_active: true,
          disconnected_reason: null,
          name: businessName.trim(),
          waba_id: wabaId,
          onboarding_type: isCoexistence ? "coexistence" : "api",
        })
        .eq("id", businessId);
    } else {
      const { data: newBusiness, error: insertError } = await adminClient
        .from("businesses")
        .insert({
          name: businessName.trim(),
          phone_number_id: phoneNumberId,
          whatsapp_number: whatsappNumber,
          access_token: accessToken,
          is_active: true,
          waba_id: wabaId,
          onboarding_type: isCoexistence ? "coexistence" : "api",
          plan: "basic",
        })
        .select("id")
        .single();

      if (insertError || !newBusiness) {
        console.error("[onboard/callback] Business insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to save business to database" },
          { status: 500 }
        );
      }

      businessId = newBusiness.id;
    }

    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: user.id,
        business_id: businessId,
        name: user.email?.split("@")[0] ?? "Admin",
        role: "admin",
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("[onboard/callback] Profile upsert error:", profileError);
      return NextResponse.json({ error: "Failed to link profile to business" }, { status: 500 });
    }

    // ── 7. Coexistence: one-time contacts + history sync (Meta allows it ONCE, within 24h) ──
    let syncStarted = false;
    if (isCoexistence) {
      const { data: row } = await adminClient
        .from("businesses")
        .select("coexistence_synced_at")
        .eq("id", businessId)
        .single();
      if (!row?.coexistence_synced_at) {
        const sync = await startCoexistenceSync(phoneNumberId, accessToken);
        console.log("[onboard/callback] coexistence sync:", JSON.stringify(sync));
        if (sync.smb_app_state_sync.ok || sync.history.ok) {
          syncStarted = true;
          await adminClient
            .from("businesses")
            .update({ coexistence_synced_at: new Date().toISOString() })
            .eq("id", businessId);
        }
      }
    }

    return NextResponse.json({
      success: true,
      coexistence: isCoexistence,
      syncStarted,
      businessId,
      phoneNumberId,
      whatsappNumber,
    });
  } catch (err) {
    console.error("[onboard/callback] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
