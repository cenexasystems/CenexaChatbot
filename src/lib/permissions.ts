export type PermissionAction = "assistant_settings" | "assistant_test" | "owner_alert_settings" | "templates_manage" | "templates_send" | "contacts_manage" | "campaign_manage" | "automation_manage" | "reports_view" | "team_manage" | "conversation_reply" | "payment_verify";

const ROLE_PERMISSIONS: Record<PermissionAction, readonly string[]> = {
  // Keep the Phase 0 matrix identical to the checks that already existed.
  assistant_settings: ["admin"],
  assistant_test: ["admin"],
  owner_alert_settings: ["admin"],
  templates_manage: ["admin", "sales"],
  templates_send: ["admin", "support", "sales", "accounts"],
  contacts_manage: ["admin", "sales"],
  campaign_manage: ["admin"],
  automation_manage: ["admin"],
  reports_view: ["admin", "accounts"],
  team_manage: ["admin"],
  conversation_reply: ["admin", "support", "sales"],
  payment_verify: ["admin", "accounts"],
};

/** Returns a 403 response when this business role cannot perform the action. */
export function requirePermission(access: { role: string }, action: PermissionAction): Response | null {
  if (ROLE_PERMISSIONS[action]?.includes(access.role)) return null;
  return Response.json({ error: "You do not have permission to perform this action" }, { status: 403 });
}

/** Strict role enforcement is opt-in per business; module permissions remain enforced directly. */
export function requireStrictPermission(access: { role: string; strictRoles?: boolean }, action: PermissionAction): Response | null {
  return access.strictRoles ? requirePermission(access, action) : null;
}
