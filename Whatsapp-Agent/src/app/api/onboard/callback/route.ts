import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/onboard/callback
 *
 * Called from the frontend after the Facebook Embedded Signup popup
 * returns an authorization code.
 *
 * Steps:
 *  1. Exchange the short-lived code for an access token
 *  2. Fetch the user's WhatsApp Business Accounts (WABA)
 *  3. Fetch phone number IDs linked to the WABA
 *  4. Register the phone number with the Cloud API
 *  5. Save a new row in `businesses` + link the auth user in `profiles`
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

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
    // The redirect_uri must match what's registered in the Meta app dashboard.
    // For Embedded Signup with response_type=code, Meta requires this exact value.
    tokenUrl.searchParams.set("redirect_uri", `${appUrl}/onboard`);

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

    // ── 3. Fetch the user's WhatsApp Business Accounts ────────────────────
    const wabaRes = await fetch(
      `https://graph.facebook.com/v19.0/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}&access_token=${accessToken}`
    );
    const wabaData = await wabaRes.json();

    if (!wabaRes.ok || wabaData.error) {
      console.error("[onboard/callback] WABA fetch failed:", wabaData);
      return NextResponse.json(
        { error: wabaData?.error?.message ?? "Failed to fetch WhatsApp Business Accounts" },
        { status: 400 }
      );
    }

    // Find the first available phone number across all businesses/WABAs
    let phoneNumberId: string | null = null;
    let whatsappNumber: string | null = null;

    outer: for (const biz of wabaData.data ?? []) {
      for (const waba of biz.owned_whatsapp_business_accounts?.data ?? []) {
        const phone = waba.phone_numbers?.data?.[0];
        if (phone?.id) {
          phoneNumberId = phone.id;
          whatsappNumber = phone.display_phone_number ?? null;
          break outer;
        }
      }
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

    // ── 4. Register the phone number with the Cloud API ───────────────────
    // This is required if the number was previously on WhatsApp Business App.
    // It's a no-op if already registered — safe to always call.
    try {
      await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: "000000", // Default PIN — client can change later in Meta dashboard
        }),
      });
    } catch (regErr) {
      // Non-fatal: log and continue. The number may already be registered.
      console.warn("[onboard/callback] Register step warning:", regErr);
    }

    // ── 5. Write to Supabase using the service role (bypasses RLS) ─────────
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if this phone_number_id is already registered
    const { data: existingBusiness } = await adminClient
      .from("businesses")
      .select("id")
      .eq("phone_number_id", phoneNumberId)
      .single();

    let businessId: string;

    if (existingBusiness) {
      // Business already exists — update the access token (token refresh scenario)
      businessId = existingBusiness.id;
      await adminClient
        .from("businesses")
        .update({ access_token: accessToken, is_active: true, name: businessName.trim() })
        .eq("id", businessId);
    } else {
      // Insert new business record
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

    // Upsert the profile — link the auth user to this business as admin
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
