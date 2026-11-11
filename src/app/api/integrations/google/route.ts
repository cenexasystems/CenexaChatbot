import { requireBusinessAccess } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";
import { decryptGoogleToken, googleSpreadsheetId, syncBusinessContacts } from "@/lib/google-sheets";

async function authorize() {
  const { access, response } = await requireBusinessAccess();
  if (response) return { response } as const;
  if (access.role !== "admin") return { response: Response.json({ error: "Business admin access required" }, { status: 403 }) } as const;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "integrations");
  if (disabled) return { response: disabled } as const;
  return { access } as const;
}

export async function GET() {
  const result = await authorize();
  if (result.response) return result.response;
  const { data, error } = await result.access.admin.from("google_sheets_integrations")
    .select("spreadsheet_id,worksheet_title,sync_enabled,last_synced_at,last_error,google_email")
    .eq("business_id", result.access.businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load Google Sheets settings" }, { status: 500 });
  return Response.json({ configured: Boolean(data), connection: data ?? null, oauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_SHEETS_REDIRECT_URI && process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY) });
}

export async function PATCH(request: Request) {
  const result = await authorize();
  if (result.response) return result.response;
  const body = await request.json().catch(() => ({}));
  const spreadsheetId = typeof body.spreadsheet === "string" ? googleSpreadsheetId(body.spreadsheet) : null;
  const worksheetTitle = typeof body.worksheetTitle === "string" ? body.worksheetTitle.trim() : "";
  if (!spreadsheetId) return Response.json({ error: "Enter a valid Google Sheets URL or spreadsheet ID" }, { status: 400 });
  if (!worksheetTitle || worksheetTitle.length > 100 || /[\[\]:*?/\\]/.test(worksheetTitle)) return Response.json({ error: "Tab name must be 1–100 characters and cannot contain []:*?/\\" }, { status: 400 });
  const { data, error } = await result.access.admin.from("google_sheets_integrations").update({ spreadsheet_id: spreadsheetId, worksheet_title: worksheetTitle, sync_enabled: body.syncEnabled === true, last_error: null, updated_at: new Date().toISOString() }).eq("business_id", result.access.businessId).select("spreadsheet_id,worksheet_title,sync_enabled,last_synced_at,last_error,google_email").maybeSingle();
  if (error) return Response.json({ error: "Unable to save Google Sheets settings" }, { status: 500 });
  if (!data) return Response.json({ error: "Connect Google before configuring a spreadsheet" }, { status: 409 });
  return Response.json({ connection: data });
}

export async function POST() {
  const result = await authorize();
  if (result.response) return result.response;
  try {
    const synced = await syncBusinessContacts(result.access.admin, result.access.businessId);
    await result.access.admin.from("google_sheets_integrations").update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("business_id", result.access.businessId);
    return Response.json({ ok: true, ...synced });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Google Sheets sync failed";
    await result.access.admin.from("google_sheets_integrations").update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("business_id", result.access.businessId);
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function DELETE() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  if (access.role !== "admin") return Response.json({ error: "Business admin access required" }, { status: 403 });
  const { data: stored } = await access.admin.from("google_sheets_integrations").select("refresh_token_ciphertext").eq("business_id", access.businessId).maybeSingle();
  if (stored?.refresh_token_ciphertext) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptGoogleToken(stored.refresh_token_ciphertext) }) });
    } catch { /* Remove the stored credential even if Google's revoke endpoint is unavailable. */ }
  }
  const { error } = await access.admin.from("google_sheets_integrations").delete().eq("business_id", access.businessId);
  if (error) return Response.json({ error: "Unable to disconnect Google Sheets" }, { status: 500 });
  return Response.json({ ok: true });
}
