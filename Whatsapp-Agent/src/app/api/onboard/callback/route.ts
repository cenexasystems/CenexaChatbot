import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/onboard/callback
 */
export async function POST(request: NextRequest) {
  try {
    const { code, businessName } = await request.json();

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
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Meta app credentials not configured. Set META_APP_ID and META_APP_SECRET." },
        { status: 500 }
      );
    }

    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    // FB.login() JS SDK flow: redirect_uri MUST NOT be included.

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    console.log("Token response:", JSON.stringify(tokenData, null, 2));

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      console.error("[onboard/callback] Token exchange failed:", tokenData);
      return NextResponse.json(
        { error: tokenData?.error?.message ?? "Failed to exchange token with Meta" },
        { status: 400 }
      );
    }

    const accessToken: string = tokenData.access_token;

    // ── 3. Find WABA ID via debug_token endpoint ──────────────────────────
    const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`;
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

    let wabaId: string | null = null;
    const granularScopes = debugData.data.granular_scopes ?? [];

    for (const scope of granularScopes) {
      if (scope.scope === "whatsapp_business_management" && scope.target_ids && scope.target_ids.length > 0) {
        wabaId = scope.target_ids[0];
        break;
      }
    }

    if (!wabaId) {
      return NextResponse.json(
        { error: "No WhatsApp Business Account found in the token scopes. Did you complete the signup?" },
        { status: 400 }
      );
    }

    // ── 4. Fetch the phone numbers for this specific WABA ─────────────────
    const wabaPhonesRes = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${accessToken}`
    );
    const wabaPhonesData = await wabaPhonesRes.json();

    if (!wabaPhonesRes.ok || wabaPhonesData.error) {
      console.error("[onboard/callback] WABA phone numbers fetch failed:", wabaPhonesData);
      return NextResponse.json(
        { error: wabaPhonesData?.error?.message ?? "Failed to fetch phone numbers for the account" },
        { status: 400 }
      );
    }

    let phoneNumberId: string | null = null;
    let whatsappNumber: string | null = null;
    
    const phone = wabaPhonesData.data?.[0];
    if (phone?.id) {
      phoneNumberId = phone.id;
      whatsappNumber = phone.display_phone_number ?? null;
    }

    if (!phoneNumberId) {
      return NextResponse.json(
        {
          error:
            "No WhatsApp phone number found in your account. Please ensure you completed the signup and added a number.",
        },
        { status: 400 }
      );
    }

    // ── 5. Register the phone number with the Cloud API ───────────────────
    try {
      await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: "000000",
        }),
      });
    } catch (regErr) {
      console.warn("[onboard/callback] Register step warning:", regErr);
    }

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
        .update({ access_token: accessToken, is_active: true, name: businessName.trim() })
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

    return NextResponse.json({
      success: true,
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
