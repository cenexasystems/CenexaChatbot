import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { code, businessName } = await request.json();

    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId!);
    tokenUrl.searchParams.set("client_secret", appSecret!);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("Token exchange failed");
    
    const accessToken: string = tokenData.access_token;

    const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();

    let wabaId: string | null = null;
    const granularScopes = debugData.data?.granular_scopes ?? [];
    for (const scope of granularScopes) {
      if (scope.scope === "whatsapp_business_management" && scope.target_ids?.length > 0) {
        wabaId = scope.target_ids[0];
        break;
      }
    }

    if (!wabaId) throw new Error("No WABA ID found");

    // CRITICAL FIX: Subscribe WABA to Webhook
    try {
      await fetch(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      console.warn("Subscribed apps error:", e);
    }

    const wabaPhonesRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${accessToken}`);
    const wabaPhonesData = await wabaPhonesRes.json();
    
    const phone = wabaPhonesData.data?.[0];
    if (!phone?.id) throw new Error("No phone number found");

    try {
      await fetch(`https://graph.facebook.com/v19.0/${phone.id}/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin: "000000" }),
      });
    } catch (e) {}

    const adminClient = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: existingBusiness } = await adminClient.from("businesses").select("id").eq("phone_number_id", phone.id).single();

    let businessId: string;
    if (existingBusiness) {
      businessId = existingBusiness.id;
      await adminClient.from("businesses").update({ access_token: accessToken, is_active: true, name: businessName }).eq("id", businessId);
    } else {
      const { data: newBusiness } = await adminClient.from("businesses").insert({
        name: businessName, phone_number_id: phone.id, whatsapp_number: phone.display_phone_number, access_token: accessToken, is_active: true, plan: "basic"
      }).select("id").single();
      businessId = newBusiness!.id;
    }

    await adminClient.from("profiles").upsert({ id: user.id, business_id: businessId, name: user.email?.split("@")[0] ?? "Admin", role: "admin" });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
