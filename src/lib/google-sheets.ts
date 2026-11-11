import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const SCOPES = "https://www.googleapis.com/auth/spreadsheets openid email";
const MAX_CONTACTS = 5000;

function encryptionKey() {
  const value = process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("Google Sheets token encryption is not configured");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key");
  return key;
}

export function encryptGoogleToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptGoogleToken(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Stored Google token is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function getGoogleSheetsConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_SHEETS_REDIRECT_URI,
  };
}

export function googleSpreadsheetId(input: string): string | null {
  const value = input.trim();
  const match = value.match(/(?:docs\.google\.com\/spreadsheets\/d\/|^)([A-Za-z0-9_-]{20,})(?:\/|$|\?)/);
  return match?.[1] ?? null;
}

async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleSheetsConfig();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? "Google authorization expired. Reconnect Google Sheets.");
  return data.access_token as string;
}

async function sheetsRequest(accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? `Google Sheets request failed (${response.status})`);
  return data;
}

export async function syncBusinessContacts(admin: SupabaseClient, businessId: string) {
  const { data: integration, error: integrationError } = await admin.from("google_sheets_integrations")
    .select("refresh_token_ciphertext,spreadsheet_id,worksheet_title")
    .eq("business_id", businessId).maybeSingle();
  if (integrationError || !integration) throw new Error("Connect a Google account and configure a spreadsheet first");

  const contacts: Array<Record<string, unknown>> = [];
  for (let start = 0; start <= MAX_CONTACTS; start += 1000) {
    const { data: batch, error } = await admin.from("contacts")
      .select("name,phone,tags,opt_in_at,opt_out_at,created_at,updated_at")
      .eq("business_id", businessId).order("created_at", { ascending: true }).range(start, Math.min(start + 999, MAX_CONTACTS));
    if (error) throw new Error("Could not load contacts for Google Sheets sync");
    contacts.push(...(batch ?? []));
    if ((batch ?? []).length < 1000) break;
  }
  if (contacts.length > MAX_CONTACTS) throw new Error(`This sync supports up to ${MAX_CONTACTS} contacts. Contact support to increase the limit.`);

  const accessToken = await refreshAccessToken(decryptGoogleToken(integration.refresh_token_ciphertext));
  const spreadsheetId = encodeURIComponent(integration.spreadsheet_id);
  const worksheet = String(integration.worksheet_title || "Cenexa Contacts").replace(/'/g, "''");
  const metadata = await sheetsRequest(accessToken, `${spreadsheetId}?fields=sheets.properties.title`);
  const hasTab = (metadata.sheets ?? []).some((sheet: { properties?: { title?: string } }) => sheet.properties?.title === integration.worksheet_title);
  if (!hasTab) await sheetsRequest(accessToken, `${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: integration.worksheet_title } } }] }) });

  const values = [
    ["Name", "Phone", "Tags", "Opt-in date", "Opt-out date", "Created at", "Updated at"],
    ...(contacts ?? []).map((contact: Record<string, unknown>) => [
      contact.name ?? "", contact.phone ?? "", Array.isArray(contact.tags) ? contact.tags.join(", ") : "",
      contact.opt_in_at ?? "", contact.opt_out_at ?? "", contact.created_at ?? "", contact.updated_at ?? "",
    ]),
  ];
  const tabRange = `'${encodeURIComponent(worksheet)}'!A:Z`;
  await sheetsRequest(accessToken, `${spreadsheetId}/values/${tabRange}:clear`, { method: "POST", body: JSON.stringify({}) });
  await sheetsRequest(accessToken, `${spreadsheetId}/values/'${encodeURIComponent(worksheet)}'!A1:append?valueInputOption=RAW&insertDataOption=OVERWRITE`, { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values }) });
  return { rows: contacts.length };
}

export async function processGoogleSheetsSyncs(admin: SupabaseClient, limit = 5) {
  const { data: integrations, error } = await admin.rpc("claim_google_sheets_syncs", { p_limit: limit });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") return { claimed: 0, processed: 0, skipped: true };
    throw new Error(`Could not claim Google Sheets syncs: ${error.message}`);
  }
  let processed = 0;
  for (const integration of integrations ?? []) {
    try {
      await syncBusinessContacts(admin, integration.business_id);
      await admin.from("google_sheets_integrations").update({ last_synced_at: new Date().toISOString(), last_error: null, sync_locked_at: null, updated_at: new Date().toISOString() }).eq("business_id", integration.business_id);
      processed += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Google Sheets sync failed";
      await admin.from("google_sheets_integrations").update({ last_error: message.slice(0, 500), sync_locked_at: null, updated_at: new Date().toISOString() }).eq("business_id", integration.business_id);
    }
  }
  return { claimed: integrations?.length ?? 0, processed };
}

export { SCOPES as GOOGLE_SHEETS_SCOPES };
