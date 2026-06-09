import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * GET /api/onboard/status
 *
 * Returns whether the currently logged-in user has a business linked.
 * Used by the onboard page and middleware to decide where to redirect.
 *
 * Response:
 *  { hasBusinesss: true, businessId, businessName, phoneNumberId, whatsappNumber }
 *  { hasBusiness: false }
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ hasBusiness: false, error: "Not authenticated" }, { status: 401 });
    }

    // Use service role to bypass RLS
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile } = await adminClient
      .from("profiles")
      .select("business_id, role, businesses(id, name, phone_number_id, whatsapp_number, is_active)")
      .eq("id", user.id)
      .single();

    if (!profile?.business_id) {
      return NextResponse.json({ hasBusiness: false });
    }

    // Cast via unknown to safely extract the nested businesses object.
    // Supabase infers this as an array type from the join, but we know it
    // returns a single object (or null) due to the FK relationship.
    type BizRow = { id: string; name: string; phone_number_id: string; whatsapp_number: string | null; is_active: boolean } | null;
    const biz = ((profile as unknown) as { businesses: BizRow }).businesses;

    return NextResponse.json({
      hasBusiness: true,
      businessId: profile.business_id,
      businessName: biz ? biz.name : null,
      phoneNumberId: biz ? biz.phone_number_id : null,
      whatsappNumber: biz ? biz.whatsapp_number : null,
      isActive: biz ? biz.is_active : false,
      role: profile.role,
    });
  } catch (err) {
    console.error("[onboard/status] Error:", err);
    return NextResponse.json({ hasBusiness: false }, { status: 500 });
  }
}
