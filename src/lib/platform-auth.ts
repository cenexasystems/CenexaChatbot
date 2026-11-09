import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { PlatformRole } from "@/lib/platform-permissions";
export { platformRoleCan } from "@/lib/platform-permissions";

export type { PlatformRole } from "@/lib/platform-permissions";
export type PlatformAccess = { userId: string; role: PlatformRole; admin: SupabaseClient };

export async function requirePlatformAccess(options: { write?: boolean } = {}): Promise<{ access: PlatformAccess; response?: never } | { access?: never; response: Response }> {
  const session = await createSessionClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const assurance = await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") return { response: Response.json({ error: "MFA verification is required", code: "MFA_REQUIRED" }, { status: 403 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { response: Response.json({ error: "Server misconfiguration" }, { status: 500 }) };
  const admin = createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error: adminError } = await admin.from("platform_admins").select("role,disabled").eq("user_id", user.id).maybeSingle();
  if (adminError) return { response: Response.json({ error: "Unable to verify platform access" }, { status: 500 }) };
  if (!data || data.disabled) return { response: Response.json({ error: "Platform access denied" }, { status: 403 }) };
  const role = data.role as PlatformRole;
  if (options.write && role === "read_only") return { response: Response.json({ error: "Read-only platform access" }, { status: 403 }) };
  return { access: { userId: user.id, role, admin } };
}
