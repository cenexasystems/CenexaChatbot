export type TenantProfile = { business_id: string | null } | null;

export type TenantScopeResult =
  | { ok: true; businessId: string }
  | { ok: false; status: 401 | 404 | 500; error: string };

/** Resolve the caller's tenant only from their authenticated profile row. */
export function resolveTenantScope(
  userId: string | null | undefined,
  profile: TenantProfile,
  profileError: unknown = null
): TenantScopeResult {
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  if (profileError) return { ok: false, status: 500, error: "Unable to load user profile" };
  if (!profile?.business_id) return { ok: false, status: 404, error: "Business profile not found" };
  return { ok: true, businessId: profile.business_id };
}

/** Keep cross-tenant resources indistinguishable from resources that do not exist. */
export function isOwnedByBusiness(
  resource: { business_id?: string | null } | null | undefined,
  businessId: string
): boolean {
  return resource?.business_id === businessId;
}
