import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireModuleEnabled(admin: SupabaseClient, businessId: string, moduleName: string): Promise<Response | null> {
  const { data, error } = await admin.from("businesses").select("modules_enabled").eq("id", businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load business modules" }, { status: 500 });
  if (!data) return Response.json({ error: "Business not found" }, { status: 404 });
  if (data.modules_enabled?.[moduleName] !== true) return Response.json({ error: "Not found" }, { status: 404 });
  return null;
}
