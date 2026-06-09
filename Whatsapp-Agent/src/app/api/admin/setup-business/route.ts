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

  const {
    name,
    phone_number_id,
    whatsapp_number,
    plan = "basic",
    ai_model = "openai/gpt-4o-mini",
    system_prompt,
    welcome_message,
  } = await request.json();

  if (!name || !phone_number_id) {
    return NextResponse.json({ error: "name and phone_number_id are required" }, { status: 400 });
  }

  // Use the META_SYSTEM_TOKEN stored in Vercel env (server-side, never exposed to client)
  const access_token = process.env.META_SYSTEM_TOKEN;
  if (!access_token) {
    return NextResponse.json({ error: "META_SYSTEM_TOKEN not set in env" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Check if already exists
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/businesses?phone_number_id=eq.${phone_number_id}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    }
  );
  const existing = await checkRes.json();

  // Get the currently logged in user
  const { createClient } = require("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (existing && existing.length > 0) {
    const businessId = existing[0].id;
    // Update existing
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/businesses?phone_number_id=eq.${phone_number_id}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          name,
          access_token,
          is_active: true,
          ...(system_prompt && { system_prompt }),
          ...(welcome_message && { welcome_message }),
        }),
      }
    );
    const updated = await updateRes.json();

    // Link user profile if user is logged in
    if (user) {
      await fetch(`${supabaseUrl}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          id: user.id,
          business_id: businessId,
          name: user.email?.split("@")[0] ?? "Admin",
          role: "admin",
        }),
      });
    }

    return NextResponse.json({
      action: "updated",
      business: updated[0],
      token_prefix: access_token.substring(0, 20) + "...",
    });
  }

  // Insert new
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/businesses`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name,
      phone_number_id,
      whatsapp_number: whatsapp_number || null,
      access_token,
      is_active: true,
      plan,
      ai_model,
      system_prompt: system_prompt || null,
      welcome_message: welcome_message || null,
    }),
  });

  const inserted = await insertRes.json();
  const newBusinessId = inserted[0].id;

  // Link user profile if user is logged in
  if (user) {
    await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        id: user.id,
        business_id: newBusinessId,
        name: user.email?.split("@")[0] ?? "Admin",
        role: "admin",
      }),
    });
  }

  return NextResponse.json({
    action: "inserted",
    business: inserted[0],
    token_prefix: access_token.substring(0, 20) + "...",
  });
}
