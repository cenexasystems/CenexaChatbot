import { cookies } from "next/headers";
import { requireBusinessAccess } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { encryptGoogleToken, getGoogleSheetsConfig } from "@/lib/google-sheets";

function back(request: Request, status: string) {
  return Response.redirect(new URL(`/integrations?google=${encodeURIComponent(status)}`, request.url));
}

export async function GET(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return back(request, "connect_failed");
  if (access.role !== "admin") return back(request, "admin_required");
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "integrations");
  if (disabled) return back(request, "module_disabled");
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("cx_google_sheets_state")?.value;
  cookieStore.delete("cx_google_sheets_state");
  if (!expectedState || url.searchParams.get("state") !== expectedState) return back(request, "invalid_state");
  if (url.searchParams.has("error")) return back(request, "cancelled");
  const code = url.searchParams.get("code");
  const config = getGoogleSheetsConfig();
  if (!code || !config.clientId || !config.clientSecret || !config.redirectUri) return back(request, "config_error");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.refresh_token) return back(request, "token_error");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json().catch(() => ({}));
    const { error } = await access.admin.from("google_sheets_integrations").upsert({
      business_id: access.businessId,
      google_email: typeof profile.email === "string" ? profile.email.slice(0, 320) : null,
      refresh_token_ciphertext: encryptGoogleToken(token.refresh_token),
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
    if (error) return back(request, "save_error");
    return back(request, "connected");
  } catch {
    return back(request, "connect_failed");
  }
}
