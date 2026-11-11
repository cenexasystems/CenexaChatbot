"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { Page } from "@/components/cx/Page";
import { Button, EmptyState, Panel, Spinner, Status } from "@/components/cx/ui";
import { buildClickToChatUrl } from "@/lib/integrations";

type LinkRow = { id: string; label: string; source_code: string; prefilled_text: string; created_at: string };
type GoogleConnection = { google_email: string | null; spreadsheet_id: string | null; worksheet_title: string; sync_enabled: boolean; last_synced_at: string | null; last_error: string | null };

const subscribeGoogleResult = (onChange: () => void) => { window.addEventListener("popstate", onChange); return () => window.removeEventListener("popstate", onChange); };
const getGoogleResult = () => new URLSearchParams(window.location.search).get("google");

export function IntegrationsManager() {
  const { business, demo, role } = useDashboard();
  const googleResult = useSyncExternalStore(subscribeGoogleResult, getGoogleResult, () => null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("Instagram");
  const [sourceCode, setSourceCode] = useState("instagram");
  const [prefilledText, setPrefilledText] = useState("Hi, I found you on Instagram and would like to know more.");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [moduleEnabled, setModuleEnabled] = useState(business?.modules_enabled?.integrations === true);
  const [google, setGoogle] = useState<GoogleConnection | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [worksheetTitle, setWorksheetTitle] = useState("Cenexa Contacts");
  const [autoSync, setAutoSync] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    let active = true;
    void fetch("/api/integrations", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!active) return;
      if (!response.ok) setError(body.error ?? "Unable to load integrations");
      else { setLinks(body.links ?? []); setPhone(body.phone ?? ""); setModuleEnabled(body.modules?.integrations === true); }
      setLoading(false);
    }).catch(() => { if (active) { setError("Unable to load integrations"); setLoading(false); } });
    return () => { active = false; };
  }, [demo]);

  useEffect(() => {
    if (demo || role !== "admin" || !moduleEnabled) return;
    let active = true;
    void fetch("/api/integrations/google", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!active) return;
      if (!response.ok) { setError(body.error ?? "Unable to load Google Sheets settings"); return; }
      setGoogle(body.connection ?? null);
      setGoogleConfigured(body.oauthConfigured === true);
      if (body.connection) {
        setSheetUrl(body.connection.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${body.connection.spreadsheet_id}/edit` : "");
        setWorksheetTitle(body.connection.worksheet_title || "Cenexa Contacts");
        setAutoSync(body.connection.sync_enabled === true);
      }
    }).catch(() => { if (active) setError("Unable to load Google Sheets settings"); });
    return () => { active = false; };
  }, [demo, role, moduleEnabled]);

  const googleMessages: Record<string, string> = {
    connected: "Google account connected. Add a spreadsheet URL to finish setup.",
    cancelled: "Google account connection was cancelled.",
    invalid_state: "Google connection could not be verified. Please try again.",
    token_error: "Google did not return an offline access token. Try connecting again.",
    save_error: "Google connected, but ChatFlow could not save the connection.",
    connect_failed: "Could not connect Google. Please try again.",
    admin_required: "Only a business admin can connect Google Sheets.",
    module_disabled: "Enable the Integrations module before connecting Google Sheets.",
    config_error: "Google OAuth is not configured for this deployment.",
  };
  const googleNotice = googleResult ? googleMessages[googleResult] : "";

  const websiteSnippet = useMemo(() => {
    const first = links[0];
    if (!first || !phone) return "";
    let url = "";
    try { url = buildClickToChatUrl(phone, first.prefilled_text, first.source_code); } catch { return ""; }
    return `<a href="${url}" target="_blank" rel="noopener">Chat on WhatsApp</a>`;
  }, [links, phone]);

  async function createLink(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const response = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, sourceCode, prefilledText }) });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to save link");
    else { setLinks((items) => [body.link, ...items]); setNotice("Tracked link created"); setLabel(""); setSourceCode(""); }
    setSaving(false);
  }

  async function removeLink(id: string) {
    const response = await fetch(`/api/integrations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to delete link");
    else setLinks((items) => items.filter((item) => item.id !== id));
  }

  async function setEnabled(enabled: boolean) {
    const response = await fetch("/api/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modules: { integrations: enabled } }) });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to update setting");
    else { setModuleEnabled(enabled); setNotice(enabled ? "Integrations enabled" : "Integrations disabled"); }
  }

  async function saveGoogleSettings(event: React.FormEvent) {
    event.preventDefault(); setGoogleBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/google", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadsheet: sheetUrl, worksheetTitle, syncEnabled: autoSync }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save Google Sheets settings");
      setGoogle(body.connection); setNotice("Google Sheets settings saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save Google Sheets settings"); }
    finally { setGoogleBusy(false); }
  }

  async function syncGoogleNow() {
    setGoogleBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/google", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Google Sheets sync failed");
      setGoogle((current) => current ? { ...current, last_synced_at: new Date().toISOString(), last_error: null } : current);
      setNotice(`Synced ${body.rows} contacts to Google Sheets.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Google Sheets sync failed"); }
    finally { setGoogleBusy(false); }
  }

  async function disconnectGoogle() {
    if (!window.confirm("Disconnect Google Sheets? Automatic sync will stop.")) return;
    setGoogleBusy(true); setError("");
    try {
      const response = await fetch("/api/integrations/google", { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not disconnect Google Sheets");
      setGoogle(null); setSheetUrl(""); setAutoSync(false); setNotice("Google Sheets disconnected.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect Google Sheets"); }
    finally { setGoogleBusy(false); }
  }

  return <Page wide section="Account" title="Integrations" subtitle="Tracked WhatsApp links and exports">
    <div className="grid gap-5 lg:grid-cols-2">
      {role === "admin" && <Panel title="Click-to-chat links" icon="link" meta={<Status tone={moduleEnabled ? "success" : "neutral"}>{moduleEnabled ? "Live" : "Off"}</Status>}>
        <div className="p-4 space-y-4">
          {!phone && <p className="text-sm text-ink-soft">Connect a WhatsApp number with its country code to create links.</p>}
          {links.map((link) => {
            let href = ""; try { href = buildClickToChatUrl(phone, link.prefilled_text, link.source_code); } catch { /* missing connected number */ }
            return <LinkCard key={link.id} link={link} href={href} onDelete={() => void removeLink(link.id)} />;
          })}
          {!loading && links.length === 0 && <EmptyState icon="link" title="No tracked links yet" body="Create a separate WhatsApp link for Instagram, your website, or another source." />}
          {loading && <Spinner />}
          {role === "admin" && !demo && <form onSubmit={createLink} className="grid gap-3 border-t border-line pt-4">
            <label className="text-xs font-semibold">Link label<input required maxLength={80} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Website" /></label>
            <label className="text-xs font-semibold">Source code<input required maxLength={40} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" value={sourceCode} onChange={(e) => setSourceCode(e.target.value)} placeholder="website" /></label>
            <label className="text-xs font-semibold">Prefilled message<textarea required maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" value={prefilledText} onChange={(e) => setPrefilledText(e.target.value)} /></label>
            <Button variant="primary" disabled={saving || !moduleEnabled || !phone}>{saving ? "Saving…" : "Create tracked link"}</Button>
          </form>}
          {!demo && role === "admin" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={moduleEnabled} onChange={(e) => void setEnabled(e.target.checked)} /> Enable integrations module</label>}
          {websiteSnippet && <CopyBlock label="Website button snippet" value={websiteSnippet} />}
          <button className="inline-flex text-sm font-semibold text-accent underline" onClick={() => window.location.assign("/api/contacts?format=csv")}>Export contacts CSV</button>
        </div>
      </Panel>}
      <Panel title="Available connections" icon="plug">
        <ul className="divide-y divide-line text-sm">
          <li className="flex justify-between gap-3 p-4"><span><strong>CSV export</strong><span className="block text-xs text-ink-faint">Contacts and Reports can be opened in spreadsheet apps.</span></span><Status tone="success">Live</Status></li>
          <li className="flex justify-between gap-3 p-4"><span><strong>Shopify sync</strong><span className="block text-xs text-ink-faint">Needs a Shopify OAuth app and app review.</span></span><Status>Later</Status></li>
          <li className="flex justify-between gap-3 p-4"><span><strong>Google Sheets sync</strong><span className="block text-xs text-ink-faint">Sync this business’s contacts to its own spreadsheet.</span></span><Status tone={google ? "success" : "neutral"}>{google ? "Connected" : "Available"}</Status></li>
        </ul>
        <div className="border-t border-line p-4"><a className="text-sm font-semibold text-accent underline" href="/api/reports?format=csv">Export today’s report CSV</a></div>
        <div className="border-t border-line p-4 space-y-3">
          {role !== "admin" ? <p className="text-xs text-ink-faint">A business admin can connect and configure Google Sheets.</p> : !moduleEnabled ? <p className="text-xs text-ink-faint">Enable the Integrations module to connect Google Sheets.</p> : (
            <>
              {!google ? <div><a href="/api/integrations/google/connect" aria-disabled={!googleConfigured} className={`inline-flex rounded-lg bg-brand px-4 py-2 text-xs font-bold text-white ${googleConfigured ? "" : "pointer-events-none opacity-50"}`}>Connect Google account</a>{!googleConfigured && <p className="mt-2 text-xs text-attention">Google OAuth credentials and token encryption key must be configured by the app administrator.</p>}</div> : <>
                <p className="text-xs text-ink-soft">Connected{google.google_email ? ` as ${google.google_email}` : ""}. ChatFlow syncs contacts into the tab below.</p>
                <form onSubmit={saveGoogleSettings} className="space-y-3">
                  <label className="block text-xs font-semibold">Google spreadsheet URL or ID<input required className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." /></label>
                  <label className="block text-xs font-semibold">Tab name<input required maxLength={100} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" value={worksheetTitle} onChange={(e) => setWorksheetTitle(e.target.value)} /></label>
                  <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="mt-0.5" /><span>Automatically sync about every 5 minutes. ChatFlow owns and replaces the contents of this tab.</span></label>
                  <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary" disabled={googleBusy}>{googleBusy ? "Saving…" : "Save sheet settings"}</Button><Button type="button" onClick={() => void syncGoogleNow()} disabled={googleBusy || !google.spreadsheet_id}>{googleBusy ? "Syncing…" : "Sync now"}</Button><Button type="button" variant="danger" onClick={() => void disconnectGoogle()} disabled={googleBusy}>Disconnect</Button></div>
                </form>
                {google.last_synced_at && <p className="text-[11px] text-ink-faint">Last sync: {new Date(google.last_synced_at).toLocaleString()}</p>}
                {google.last_error && <p className="text-xs text-danger" role="alert">Last sync failed: {google.last_error}</p>}
              </>}
              <p className="text-[11px] text-ink-faint">This is one-way contact export from ChatFlow to Sheets; editing the sheet does not change ChatFlow. You can use separate spreadsheets per business.</p>
            </>
          )}
        </div>
      </Panel>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}{(googleNotice || notice) && <p role="status" className="mt-4 text-sm text-ink-soft">{googleNotice || notice}</p>}
    {demo && <p className="mt-4 text-xs text-ink-faint">Sample mode: connect a WhatsApp business number to create live links.</p>}
  </Page>;
}

function LinkCard({ link, href, onDelete }: { link: LinkRow; href: string; onDelete: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => { let active = true; if (href) void QRCode.toDataURL(href, { errorCorrectionLevel: "M", margin: 2, width: 240 }).then((value) => { if (active) setQr(value); }); return () => { active = false; }; }, [href]);
  return <article className="rounded-xl border border-line p-3 space-y-2">
    <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{link.label}</strong><p className="font-mono text-xs text-ink-faint">source: {link.source_code}</p></div><button className="text-xs text-danger underline" onClick={onDelete}>Delete</button></div>
    {href && <CopyBlock label="WhatsApp link" value={href} />}
    {qr && <div className="flex flex-wrap items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- QR is generated as a local data URL. */}
      <img src={qr} alt={`QR code for ${link.label} WhatsApp link`} width={120} height={120} className="rounded border border-line bg-white p-1" />
      <a className="text-xs font-semibold text-accent underline" download={`chatflow-${link.source_code}-qr.png`} href={qr}>Download QR</a><button className="text-xs font-semibold underline" onClick={() => window.print()}>Print link and QR</button></div>}
    <p className="text-xs text-ink-faint">Attribution is best effort: customers can edit the prefilled source text.</p>
  </article>;
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="space-y-1"><p className="text-[11px] font-bold text-ink-soft">{label}</p><div className="flex gap-2"><input readOnly value={value} className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px]" /><button className="shrink-0 rounded-lg border border-line-strong px-2 text-xs font-semibold" onClick={() => { void navigator.clipboard.writeText(value).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy"}</button></div></div>;
}
