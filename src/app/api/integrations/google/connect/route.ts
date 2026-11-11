import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireBusinessAccess } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { getGoogleSheetsConfig, GOOGLE_SHEETS_SCOPES } from "@/lib/google-sheets";

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  if (access.role !== "admin") return Response.json({ error: "Business admin access required" }, { status: 403 });
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "integrations");
  if (disabled) return disabled;
  const config = getGoogleSheetsConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri || !process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY) {
    return Response.json({ error: "Google Sheets is not configured on this deployment" }, { status: 503 });
  }
  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("cx_google_sheets_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/google/callback", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: GOOGLE_SHEETS_SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
  return Response.redirect(url);
}
