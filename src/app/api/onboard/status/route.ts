import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * GET /api/onboard/status
 * Returns { hasBusiness: boolean } so the onboarding UI knows if user is already linked to a business.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const admin = createAdminClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[/api/onboard/status] Could not read profile:", profileError.message);
      return NextResponse.json({ error: "Could not check business status" }, { status: 500 });
    }
    if (!profile?.business_id) return NextResponse.json({ hasBusiness: false });

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id")
      .eq("id", profile.business_id)
      .maybeSingle();

    if (businessError) {
      console.error("[/api/onboard/status] Could not read business:", businessError.message);
      return NextResponse.json({ error: "Could not check business status" }, { status: 500 });
    }
    return NextResponse.json({ hasBusiness: !!business });
  } catch (error) {
    console.error("[/api/onboard/status] Error:", error);
    return NextResponse.json({ error: "Could not check business status" }, { status: 500 });
  }
}
