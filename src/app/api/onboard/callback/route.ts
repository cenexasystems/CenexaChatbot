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
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid onboarding request" }, { status: 400 });
    }
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid onboarding request" }, { status: 400 });
    }
    const { code, businessName: rawBusinessName, wabaId: clientWabaId, registrationPin, onboardingType } = payload as {
      code?: unknown;
      businessName?: unknown;
      wabaId?: unknown;
      registrationPin?: unknown;
      onboardingType?: unknown;
    };

    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
    }
    if (typeof rawBusinessName !== "string" || !rawBusinessName.trim() || rawBusinessName.trim().length > 120) {
      return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    }
    if (onboardingType !== "api" && onboardingType !== "coexistence") {
      return NextResponse.json({ error: "Choose API number or WhatsApp Business app onboarding and try again." }, { status: 400 });
    }
    const businessName = rawBusinessName.trim();
    if (onboardingType === "api" && (typeof registrationPin !== "string" || !/^\d{6}$/.test(registrationPin))) {
      return NextResponse.json({ error: "Enter the number owner's six-digit WhatsApp PIN for API setup." }, { status: 400 });
    }
    if (registrationPin !== undefined && (typeof registrationPin !== "string" || !/^\d{6}$/.test(registrationPin))) {
      return NextResponse.json({ error: "The WhatsApp registration PIN must be six digits." }, { status: 400 });
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Business onboarding is temporarily unavailable" }, { status: 500 });
    }
    const adminClient = createAdminClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: currentProfile, error: currentProfileError } = await adminClient
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();
    if (currentProfileError) {
      console.error("[onboard/callback] Profile lookup failed:", currentProfileError.message);
      return NextResponse.json({ error: "Could not check your workspace. Please try again." }, { status: 500 });
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
      console.error("[onboard/callback] Token exchange failed:", tokenData?.error?.type ?? "Meta rejected the code");
      return NextResponse.json(
        { error: "Meta could not finish connecting your account. Please restart WhatsApp setup." },
        { status: 400 }
      );
    }

    const accessToken: string = tokenData.access_token;

    // ── 3. Find WABA ID via debug_token endpoint ──────────────────────────
    const debugUrl = new URL(`${GRAPH_BASE}/debug_token`);
    debugUrl.searchParams.set("input_token", accessToken);
    debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
    const debugRes = await fetch(debugUrl.toString());
    const debugData = await debugRes.json();

    if (!debugRes.ok || debugData.error || !debugData.data) {
      console.error("[onboard/callback] Meta token validation failed");
      return NextResponse.json(
        { error: "Meta could not verify the permissions for this account. Please restart WhatsApp setup." },
        { status: 400 }
      );
    }

    // The signup event (WA_EMBEDDED_SIGNUP) gives us a waba_id, but never trust the browser:
    // only accept it if the token's granular scopes actually include it.
    const grantedWabaIds: string[] = [];
    for (const scope of debugData.data.granular_scopes ?? []) {
      if (scope.scope === "whatsapp_business_management") grantedWabaIds.push(...(scope.target_ids ?? []));
    }
    const wabaId: string | null = typeof clientWabaId === "string" && grantedWabaIds.includes(clientWabaId)
      ? clientWabaId
      : grantedWabaIds.length === 1 ? grantedWabaIds[0] : null;

    if (!wabaId) {
      return NextResponse.json(
        { error: "Could not identify one WhatsApp Business Account. Please restart setup and select one account." },
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
        console.error("[onboard/callback] WABA phone numbers fetch failed:", data?.error?.type ?? `HTTP ${res.status}`);
        if (attempt === 3) {
          return NextResponse.json(
            { error: "Could not load phone numbers from Meta. Please try again." },
            { status: 400 }
          );
        }
        continue;
      }
      phones = data.data ?? [];
    }

    // Never attach an arbitrary phone when a client has more than one.
    if (phones.length > 1) {
      return NextResponse.json(
        { error: "This WhatsApp account has more than one phone number. Contact support so we can connect the correct number safely." },
        { status: 400 }
      );
    }
    const phone = phones.length === 1 ? phones[0] : phones.find((p) => p.id === clientWabaId);
    const phoneNumberId: string | null = phone?.id ?? null;
    const whatsappNumber: string | null = phone?.display_phone_number ?? null;

    if (!phone || !phoneNumberId) {
      return NextResponse.json(
        { error: "No WhatsApp phone number found in your account. Please ensure you completed the signup and added a number." },
        { status: 400 }
      );
    }

    // Meta's own flag is the source of truth for which path this was.
    const status = await getPhoneCoexistenceStatus(phoneNumberId, accessToken);
    if (!status.ok && typeof phone.is_on_biz_app !== "boolean") {
      console.error("[onboard/callback] Could not determine WhatsApp connection type");
      return NextResponse.json({ error: "Could not confirm this number's WhatsApp setup type. Please try again." }, { status: 502 });
    }
    const isCoexistence = phone?.is_on_biz_app === true || status.isOnBizApp;
    if (onboardingType === "coexistence" && !isCoexistence) {
      return NextResponse.json({ error: "Meta did not complete WhatsApp Business app linking. Check that Coexistence is enabled for the Meta signup configuration, then restart setup." }, { status: 400 });
    }
    if (onboardingType === "api" && isCoexistence) {
      return NextResponse.json({ error: "Meta identified this as a WhatsApp Business app number. Restart setup and choose Existing Business app number." }, { status: 400 });
    }

    // Check workspace ownership before making any Meta-side changes.
    const { data: existingBusiness, error: existingBusinessError } = await adminClient
      .from("businesses")
      .select("id")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (existingBusinessError) {
      console.error("[onboard/callback] Existing business lookup failed:", existingBusinessError.message);
      return NextResponse.json({ error: "Could not check whether this number is already connected." }, { status: 500 });
    }
    if (currentProfile?.business_id && currentProfile.business_id !== existingBusiness?.id) {
      return NextResponse.json(
        { error: "Your account is already connected to a business. Ask an administrator before changing its WhatsApp number." },
        { status: 409 }
      );
    }
    if (existingBusiness) {
      const { data: otherProfiles, error: ownershipError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("business_id", existingBusiness.id)
        .neq("id", user.id)
        .limit(1);
      if (ownershipError) {
        console.error("[onboard/callback] Number ownership check failed:", ownershipError.message);
        return NextResponse.json({ error: "Could not verify number ownership. Please try again." }, { status: 500 });
      }
      if (otherProfiles?.length) {
        return NextResponse.json({ error: "This WhatsApp number is already connected to another workspace." }, { status: 409 });
      }
    }

    // ── 5. Register (API-only numbers) — NEVER for coexistence ────────────
    // Coexistence numbers are already registered; calling /register would fight the Business app.
    if (!isCoexistence) {
      if (typeof registrationPin !== "string") {
        return NextResponse.json(
          { error: "This number needs its six-digit WhatsApp two-step verification PIN. Restart setup and enter the PIN." },
          { status: 400 }
        );
      }
      try {
        const registerResponse = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", pin: registrationPin }),
        });
        const registerData = await registerResponse.json().catch(() => ({}));
        if (!registerResponse.ok || registerData.error) {
          console.error("[onboard/callback] Meta phone registration failed:", registerData?.error?.type ?? `HTTP ${registerResponse.status}`);
          return NextResponse.json(
            { error: "Meta could not register this phone number. Check its WhatsApp two-step verification PIN and try again." },
            { status: 400 }
          );
        }
      } catch (regErr) {
        console.error("[onboard/callback] Meta phone registration request failed:", regErr);
        return NextResponse.json({ error: "Could not register the phone number with Meta. Please try again." }, { status: 502 });
      }
    }

    // Subscribe our app to this customer's WABA so webhooks (incl. smb_message_echoes) reach us.
    const sub = await subscribeAppToWaba(wabaId, accessToken);
    if (!sub.ok) {
      console.error("[onboard/callback] WABA webhook subscription failed:", `HTTP ${sub.status}`);
      return NextResponse.json(
        { error: "Meta could not enable message delivery for this number. Please try again or contact support." },
        { status: 502 }
      );
    }

    // ── 6. Write to Supabase using the service role (bypasses RLS) ────────
    let businessId: string;

    if (existingBusiness) {
      businessId = existingBusiness.id;
      const { error: updateError } = await adminClient
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
      if (updateError) {
        console.error("[onboard/callback] Business update failed:", updateError.message);
        return NextResponse.json({ error: "Could not update the connected business." }, { status: 500 });
      }
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

    let profileError;
    if (!currentProfile) {
      const result = await adminClient.from("profiles").insert({
        id: user.id,
        business_id: businessId,
        name: user.email?.split("@")[0] ?? "Admin",
        role: "admin",
      });
      profileError = result.error;
    } else if (!currentProfile.business_id) {
      const result = await adminClient
        .from("profiles")
        .update({ business_id: businessId })
        .eq("id", user.id)
        .is("business_id", null);
      profileError = result.error;
    }

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
      { error: "WhatsApp setup could not be completed. Please try again." },
      { status: 500 }
    );
  }
}
