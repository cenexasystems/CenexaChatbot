import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    // Use SSR client (cookie-based) only to verify the auth session
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service role client to bypass RLS for data queries
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get the profile to find the business_id
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.business_id) {
      console.error("[/api/me] Profile not found for user:", user.id, profileError?.message);
      return NextResponse.json({ error: "Profile or business not found" }, { status: 404 });
    }

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id, name, qr_image_url")
      .eq("id", profile.business_id)
      .single();

    if (businessError || !business) {
      console.error("[/api/me] Business not found:", profile.business_id, businessError?.message);
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    return NextResponse.json({ business });
  } catch (error) {
    console.error("[/api/me] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
