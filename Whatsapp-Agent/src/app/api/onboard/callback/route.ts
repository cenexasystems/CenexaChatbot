import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // business_id passed via state param

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cenexa-chatbot.vercel.app";
  const redirectUri = `${appUrl}/api/onboard/callback`;

  if (!appId || !appSecret) {
    console.error("Missing META_APP_ID or META_APP_SECRET env vars");
    return NextResponse.json({ error: "Server misconfiguration: missing Meta app credentials" }, { status: 500 });
  }

  try {
    // Step 1: Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    // --- REQUESTED DEBUG LOG ---
    console.log("Token response:", JSON.stringify(tokenData, null, 2));

    if (tokenData.error) {
      console.error("Token exchange failed:", tokenData.error);
      return NextResponse.json(
        { error: "Token exchange failed", detail: tokenData.error },
        { status: 400 }
      );
    }

    const userAccessToken = tokenData.access_token;

    // Step 2: Debug the token to extract granular_scopes (WABA ID)
    const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${userAccessToken}&access_token=${appId}|${appSecret}`;

    const debugRes = await fetch(debugUrl);
    const debugJson = await debugRes.json();
    const debugData = debugJson.data;

    // --- REQUESTED DEBUG LOG ---
    console.log("Debug token info:", JSON.stringify(debugData, null, 2));

    // Step 3: Extract WABA ID from granular_scopes
    const granularScopes: Array<{ scope: string; target_ids?: string[] }> =
      debugData?.granular_scopes || [];

    console.log("Granular scopes:", JSON.stringify(granularScopes, null, 2));

    const wabScope = granularScopes.find(
      (s) => s.scope === "whatsapp_business_management"
    );

    if (!wabScope || !wabScope.target_ids || wabScope.target_ids.length === 0) {
      console.error(
        "No WhatsApp Business Account found in the token scopes. granular_scopes:",
        JSON.stringify(granularScopes, null, 2)
      );
      return NextResponse.json(
        {
          error: "No WhatsApp Business Account found in the token scopes",
          granular_scopes: granularScopes,
        },
        { status: 400 }
      );
    }

    const wabaId = wabScope.target_ids[0];
    console.log("Extracted WABA ID:", wabaId);

    // Step 4: Get phone numbers under this WABA
    const phonesRes = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${userAccessToken}`
    );
    const phonesData = await phonesRes.json();
    console.log("Phone numbers response:", JSON.stringify(phonesData, null, 2));

    const phoneNumberId = phonesData?.data?.[0]?.id;

    // Step 5: Get a long-lived System User token OR store the user token
    // For now, store the user token (business should generate a permanent system user token later)

    // Step 6: Update or create the business record in Supabase
    if (state) {
      // Update existing business record
      const { error: updateError } = await supabase
        .from("businesses")
        .update({
          waba_id: wabaId,
          access_token: userAccessToken,
          phone_number_id: phoneNumberId || null,
          is_active: true,
        })
        .eq("id", state);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        return NextResponse.json({ error: "Database update failed" }, { status: 500 });
      }

      console.log("Business updated successfully:", state);
    } else {
      // No state — just return the data for the frontend to handle
      return NextResponse.json({
        success: true,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        access_token: userAccessToken,
        message: "WhatsApp Business Account connected successfully",
      });
    }

    // Redirect to the main dashboard with success message
    const dashboardUrl = new URL(appUrl);
    dashboardUrl.searchParams.set("onboard_success", "1");
    dashboardUrl.searchParams.set("waba_id", wabaId);

    return NextResponse.redirect(dashboardUrl.toString());
  } catch (err) {
    console.error("Onboard callback error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
