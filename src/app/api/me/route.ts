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
      .select("business_id, role, status, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[/api/me] Could not read profile:", profileError.message);
      return NextResponse.json({ error: "Could not load your profile" }, { status: 500 });
    }

    if (!profile?.business_id) {
      return NextResponse.json({ error: "Profile or business not found" }, { status: 404 });
    }
    if (profile.status === "disabled") {
      return NextResponse.json({ error: "This account is disabled" }, { status: 403 });
    }
    if (profile.status === "invited") {
      const { error: activationError } = await admin.from("profiles").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", user.id).eq("business_id", profile.business_id).eq("status", "invited");
      if (activationError) return NextResponse.json({ error: "Unable to activate your invited account" }, { status: 500 });
    }
    if (user.email && user.email.toLowerCase() !== profile.email?.toLowerCase()) {
      await admin.from("profiles").update({ email: user.email.toLowerCase(), updated_at: new Date().toISOString() }).eq("id", user.id).eq("business_id", profile.business_id);
    }

    const initialBusiness = await admin
      .from("businesses")
      .select("id, name, qr_image_url, dashboard_v2_enabled, modules_enabled, strict_roles, reporting_history_start_date, platform_suspended")
      .eq("id", profile.business_id)
      .maybeSingle();
    let business: Record<string, unknown> | null = initialBusiness.data as Record<string, unknown> | null;
    let businessError = initialBusiness.error;

    // The dashboard rollout column is additive. Older production databases can
    // still serve the dashboard while that migration is being applied.
    if (businessError && (businessError.code === "PGRST204" || businessError.code === "42703")) {
      const hasMissingModuleColumn = businessError.message.includes("modules_enabled");
      const hasMissingDashboardColumn = businessError.message.includes("dashboard_v2_enabled");
      if (hasMissingModuleColumn || hasMissingDashboardColumn) {
        const legacySelect = hasMissingModuleColumn
          ? "id, name, qr_image_url, dashboard_v2_enabled"
          : "id, name, qr_image_url, modules_enabled";
        const legacy = await admin
          .from("businesses")
          .select(legacySelect)
          .eq("id", profile.business_id)
          .maybeSingle();
        business = legacy.data
          ? {
              ...legacy.data,
              ...(hasMissingModuleColumn ? { modules_enabled: {} } : { dashboard_v2_enabled: false }),
            }
          : null;
        businessError = legacy.error;

        // Very old schemas may lack both additive columns.
        if (
          businessError &&
          (businessError.message.includes("dashboard_v2_enabled") || businessError.message.includes("modules_enabled"))
        ) {
          const oldest = await admin
            .from("businesses")
            .select("id, name, qr_image_url")
            .eq("id", profile.business_id)
            .maybeSingle();
          business = oldest.data ? { ...oldest.data, dashboard_v2_enabled: false, modules_enabled: {} } : null;
          businessError = oldest.error;
        }
      }
    }

    if (businessError) {
      console.error("[/api/me] Could not read business:", profile.business_id, businessError.message);
      return NextResponse.json({ error: "Could not load your business" }, { status: 500 });
    }

    if (!business) {
      console.error("[/api/me] Business not found:", profile.business_id);
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    if (business.platform_suspended === true) {
      return NextResponse.json({ error: "This business is suspended. Contact Cenexa support." }, { status: 403 });
    }

    return NextResponse.json({
      user: { id: user.id, role: profile.role ?? "support" },
      business: { ...business, modules_enabled: business.modules_enabled ?? {} },
    });
  } catch (error) {
    console.error("[/api/me] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
