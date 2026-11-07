import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { isOwnedByBusiness, resolveTenantScope } from "@/lib/tenant-authorization";

export type BusinessAccess = {
  businessId: string;
  userId: string;
  role: string;
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

  let profile: { business_id: string | null; role: string | null } | null = null;
  let profileError: unknown = null;
  if (user && !userError) {
    const result = await admin
      .from("profiles")
      .select("business_id, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = result.data;
    profileError = result.error;
  }

  const scope = resolveTenantScope(userError ? null : user?.id, profile, profileError);
  if (!scope.ok) {
    return { response: Response.json({ error: scope.error }, { status: scope.status }) };
  }

  return { access: { businessId: scope.businessId, userId: user!.id, role: profile!.role ?? "support", admin } };
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
