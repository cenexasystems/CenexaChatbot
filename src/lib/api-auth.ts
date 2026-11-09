import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { isOwnedByBusiness, resolveTenantScope } from "@/lib/tenant-authorization";
export { requirePermission, requireStrictPermission } from "@/lib/permissions";

export type BusinessAccess = {
  businessId: string;
  userId: string;
  role: string;
  strictRoles: boolean;
  admin: SupabaseClient;
};

export async function requireBusinessAccess(): Promise<
  { access: BusinessAccess; response?: never } | { access?: never; response: Response }
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { response: Response.json({ error: "Server misconfiguration" }, { status: 500 }) };
  }

  const sessionClient = await createSessionClient();
  const { data: { user }, error: userError } = await sessionClient.auth.getUser();
  const admin = createAdminClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let profile: { business_id: string | null; role: string | null; status: string | null } | null = null;
  let profileError: unknown = null;
  if (user && !userError) {
    const result = await admin
      .from("profiles")
      .select("business_id, role, status")
      .eq("id", user.id)
      .maybeSingle();
    profile = result.data;
    profileError = result.error;
  }

  const scope = resolveTenantScope(userError ? null : user?.id, profile, profileError);
  if (!scope.ok) {
    return { response: Response.json({ error: scope.error }, { status: scope.status }) };
  }

  if (profile?.status === "disabled") {
    return { response: Response.json({ error: "This account is disabled" }, { status: 403 }) };
  }
  if (profile?.status === "invited") {
    const { error: activationError } = await admin.from("profiles").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", user!.id).eq("business_id", scope.businessId).eq("status", "invited");
    if (activationError) return { response: Response.json({ error: "Unable to activate your invited account" }, { status: 500 }) };
  }
  const { data: business, error: businessError } = await admin.from("businesses").select("strict_roles,platform_suspended").eq("id", scope.businessId).maybeSingle();
  if (businessError || !business) return { response: Response.json({ error: "Business not found" }, { status: 404 }) };
  if (business.platform_suspended) return { response: Response.json({ error: "This business is suspended. Contact Cenexa support." }, { status: 403 }) };

  return { access: { businessId: scope.businessId, userId: user!.id, role: profile!.role ?? "support", strictRoles: business.strict_roles ?? false, admin } };
}

export async function getOwnedConversation(
  admin: SupabaseClient,
  businessId: string,
  conversationId: string,
  select = "*"
): Promise<{ conversation: Record<string, unknown>; error: null } | { conversation: null; error: unknown }> {
  const fields = select === "*" || select.split(",").some((field) => field.trim() === "business_id")
    ? select
    : `${select}, business_id`;
  const { data, error } = await admin
    .from("conversations")
    .select(fields)
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return { conversation: null, error };
  const conversation = data as unknown as Record<string, unknown> | null;
  if (!isOwnedByBusiness(conversation as { business_id?: string | null } | null, businessId)) {
    return { conversation: null, error: null };
  }
  return { conversation, error: null };
}

export function conversationNotFound(): Response {
  return Response.json({ error: "Conversation not found" }, { status: 404 });
}
