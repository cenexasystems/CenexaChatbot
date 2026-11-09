export type PlatformRole = "owner" | "support" | "read_only";
export function platformRoleCan(role: PlatformRole, action: "tenant_flags" | "tenant_controls" | "manage_admins") {
  if (role === "owner") return true;
  if (role === "support") return action === "tenant_flags";
  return false;
}
