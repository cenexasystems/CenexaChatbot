import { NextRequest, NextResponse } from "next/server";

/**
 * ONE-TIME admin route to manually insert a business record.
 * Call: POST /api/admin/setup-business
 * Protected by ADMIN_SECRET query param.
 * DELETE THIS FILE after use.
 */
export async function POST(request: NextRequest) {
  // Basic security: require a secret query param
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== "cenexa-admin-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use the META_SYSTEM_TOKEN stored in Vercel env
  const access_token = process.env.META_SYSTEM_TOKEN;
  if (!access_token) {
    return NextResponse.json({ error: "META_SYSTEM_TOKEN not set in env" }, { status: 500 });
  }

  const { action, phone_number_id, code, waba_id } = await request.json();

  if (action === "request_code") {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/request_code`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code_method: "SMS",
        language: "en",
      }),
    });
    const data = await res.json();
    return NextResponse.json({ action: "request_code", result: data });
  }

  if (action === "subscribe_app") {
    const res = await fetch(`https://graph.facebook.com/v19.0/${waba_id}/subscribed_apps`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    return NextResponse.json({ action: "subscribe_app", result: data });
  }

  if (action === "register") {
    const registerRes = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin: "123456", // standard 6-digit pin for registration
      }),
    });
    const registerData = await registerRes.json();
    return NextResponse.json({ action: "register_only", register: registerData });
  }

  if (action === "verify_code") {
    // 1. Verify code
    const verifyRes = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/verify_code`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    const verifyData = await verifyRes.json();

    if (verifyData.error) {
      return NextResponse.json({ action: "verify_code", error: verifyData.error });
    }

    // 2. Register number
    const registerRes = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin: "000000",
      }),
    });
    const registerData = await registerRes.json();

    return NextResponse.json({ action: "verify_and_register", verify: verifyData, register: registerData });
  }

  // --- Normal Business Setup (Already handled previously) ---
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
