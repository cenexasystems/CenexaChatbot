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
      return NextResponse.json({ hasBusiness: false });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy"
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({ hasBusiness: !!profile?.business_id });
  } catch {
    return NextResponse.json({ hasBusiness: false });
  }
}
