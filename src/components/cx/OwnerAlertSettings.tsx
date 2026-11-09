"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Panel, Button } from "@/components/cx/ui";

type Settings = {
  owner_alerts_enabled: boolean;
  owner_whatsapp_alerts_enabled: boolean;
  owner_whatsapp_number: string | null;
  owner_alert_realert_minutes: number;
  owner_alert_quiet_hours_start: string;
  owner_alert_quiet_hours_end: string;
  owner_alert_timezone: string;
};

const EMPTY: Settings = {
  owner_alerts_enabled: true,
  owner_whatsapp_alerts_enabled: false,
  owner_whatsapp_number: "",
  owner_alert_realert_minutes: 15,
  owner_alert_quiet_hours_start: "22:00",
  owner_alert_quiet_hours_end: "08:00",
  owner_alert_timezone: "Asia/Kolkata",
};

function applicationServerKey(value: string): Uint8Array {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`;
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAppleMobileSafe() {
  return typeof navigator !== "undefined" && isAppleMobile();
}

function isInstalledPwa() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function isInstalledPwaSafe() {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && isInstalledPwa();
}

export function OwnerAlertSettings({ demo = false }: { demo?: boolean }) {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [whatsappTemplateConfigured, setWhatsappTemplateConfigured] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [workingPush, setWorkingPush] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) return;
    let live = true;
    Promise.all([
      fetch("/api/owner-alerts/settings").then((res) => res.json()),
      fetch("/api/push/subscriptions").then((res) => res.json()),
    ])
      .then(async ([alertData, pushData]) => {
        if (!live) return;
        if (alertData.settings) {
          setSettings({
            ...alertData.settings,
            owner_whatsapp_number: alertData.settings.owner_whatsapp_number ?? "",
            owner_alert_quiet_hours_start: String(alertData.settings.owner_alert_quiet_hours_start ?? "22:00").slice(0, 5),
            owner_alert_quiet_hours_end: String(alertData.settings.owner_alert_quiet_hours_end ?? "08:00").slice(0, 5),
          });
        }
        setWhatsappTemplateConfigured(alertData.whatsappTemplateConfigured === true);
        setPushConfigured(alertData.pushConfigured === true);
        setPushKey(pushData.publicKey ?? null);
        // Push subscriptions belong to one browser/device. Do not treat a subscription
        // saved on a laptop as if this phone were already subscribed.
        if ("serviceWorker" in navigator && "PushManager" in window) {
          try {
            const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
            setPushSubscribed(Boolean(await registration.pushManager.getSubscription()));
          } catch {
            setPushSubscribed(false);
          }
        } else {
          setPushSubscribed(false);
        }
      })
      .catch(() => live && setError("Could not load alert settings."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [demo]);

  function change(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = event.currentTarget;
    const nextValue = type === "checkbox"
      ? (event.currentTarget as HTMLInputElement).checked
      : name === "owner_alert_realert_minutes" ? Number(value) : value;
    setSettings((current) => ({ ...current, [name]: nextValue }));
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...settings,
        owner_whatsapp_number: settings.owner_whatsapp_number?.trim() || null,
        owner_alert_quiet_hours_start: settings.owner_alert_quiet_hours_start.slice(0, 5),
        owner_alert_quiet_hours_end: settings.owner_alert_quiet_hours_end.slice(0, 5),
      };
      const response = await fetch("/api/owner-alerts/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save settings.");
      setSettings((current) => ({ ...current, ...data.settings, owner_whatsapp_number: data.settings.owner_whatsapp_number ?? "" }));
      setNotice("Alert settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function enablePush() {
    setWorkingPush(true);
    setError("");
    setNotice("");
    try {
      if (!pushKey) throw new Error("Web Push is not configured on this server.");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("This browser does not support push notifications. Update your browser or use Chrome on Android, or install Cenexa on iPhone/iPad with iOS 16.4 or later.");
      }
      if (isAppleMobile() && !isInstalledPwa()) {
        throw new Error("On iPhone or iPad, first use Safari Share → Add to Home Screen. Open Cenexa from that icon, then enable notifications.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser to receive owner alerts.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(pushKey) as BufferSource,
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not enable push notifications.");
      setPushSubscribed(true);
      setNotice("Push notifications are enabled on this device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable push notifications.");
    } finally {
      setWorkingPush(false);
    }
  }

  async function disablePush() {
    setWorkingPush(true);
    setError("");
    setNotice("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Could not remove the push subscription.");
        await subscription.unsubscribe();
      }
      setPushSubscribed(false);
      setNotice("Push notifications are disabled on this device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable push notifications.");
    } finally {
      setWorkingPush(false);
    }
  }

  return (
    <Panel title="Owner alerts" icon="alert" meta={<span className="eyebrow !text-[9px]">Phase 1</span>}>
      {demo ? (
        <p className="p-4 text-[13px] text-ink-soft">Alerts are unavailable in sample data.</p>
      ) : loading ? (
        <p className="p-4 text-[13px] text-ink-faint">Loading alert settings…</p>
      ) : (
        <div className="p-4 space-y-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold">Browser notifications</p>
                <p className="text-[12px] text-ink-faint">Handoffs and payment screenshots on this phone or browser.</p>
              </div>
              {pushSubscribed ? (
                <Button size="sm" onClick={disablePush} disabled={workingPush}>Turn off</Button>
              ) : (
                <Button size="sm" variant="primary" onClick={enablePush} disabled={workingPush || !pushConfigured || !pushKey}>
                  {workingPush ? "Working…" : "Enable"}
                </Button>
              )}
            </div>
            {isAppleMobileSafe() && !isInstalledPwaSafe() && (
              <p className="text-[11px] text-ink-faint">On iPhone/iPad, add Cenexa to your Home Screen from Safari, open it there, then enable alerts here.</p>
            )}
            {!pushConfigured && <p className="text-[11px] text-attention">The app administrator must set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in the hosting environment, then redeploy. Generate a pair once with <code>npx web-push generate-vapid-keys</code>; keep the private key server-only.</p>}
          </section>

          <label className="flex items-center justify-between gap-4 border-t border-line pt-4">
            <span><span className="block text-[13px] font-semibold">Owner alerts</span><span className="block text-[12px] text-ink-faint">Send notifications when a customer needs a person or a payment needs review.</span></span>
            <input type="checkbox" name="owner_alerts_enabled" checked={settings.owner_alerts_enabled} onChange={change} className="h-4 w-4 accent-accent" />
          </label>

          <section className="border-t border-line pt-4 space-y-3">
            <label className="flex items-center justify-between gap-4">
              <span><span className="block text-[13px] font-semibold">WhatsApp alert to owner</span><span className="block text-[12px] text-ink-faint">Uses a pre-approved Meta utility template.</span></span>
              <input type="checkbox" name="owner_whatsapp_alerts_enabled" checked={settings.owner_whatsapp_alerts_enabled} onChange={change} disabled={!whatsappTemplateConfigured} className="h-4 w-4 accent-accent" />
            </label>
            {!whatsappTemplateConfigured && <p className="text-[11px] text-attention">Set WHATSAPP_OWNER_ALERT_TEMPLATE to the approved Utility template name in the app environment, then redeploy to enable this channel.</p>}
            <label className="block space-y-1">
              <span className="eyebrow !text-[9px]">Owner WhatsApp number</span>
              <input name="owner_whatsapp_number" value={settings.owner_whatsapp_number ?? ""} onChange={change} placeholder="+919876543210" inputMode="tel" className="w-full h-10 rounded-[9px] border border-line-strong bg-surface px-3 text-[13px]" />
            </label>
          </section>

          <section className="grid sm:grid-cols-2 gap-3 border-t border-line pt-4">
            <label className="block space-y-1">
              <span className="eyebrow !text-[9px]">Quiet hours start</span>
              <input type="time" name="owner_alert_quiet_hours_start" value={settings.owner_alert_quiet_hours_start.slice(0, 5)} onChange={change} className="w-full h-10 rounded-[9px] border border-line-strong bg-surface px-3 text-[13px]" />
            </label>
            <label className="block space-y-1">
              <span className="eyebrow !text-[9px]">Quiet hours end</span>
              <input type="time" name="owner_alert_quiet_hours_end" value={settings.owner_alert_quiet_hours_end.slice(0, 5)} onChange={change} className="w-full h-10 rounded-[9px] border border-line-strong bg-surface px-3 text-[13px]" />
            </label>
            <label className="block space-y-1">
              <span className="eyebrow !text-[9px]">Time zone</span>
              <input name="owner_alert_timezone" value={settings.owner_alert_timezone} onChange={change} placeholder="Asia/Kolkata" className="w-full h-10 rounded-[9px] border border-line-strong bg-surface px-3 text-[13px]" />
            </label>
            <label className="block space-y-1">
              <span className="eyebrow !text-[9px]">Re-alert after (minutes)</span>
              <input type="number" min={1} max={1440} name="owner_alert_realert_minutes" value={settings.owner_alert_realert_minutes} onChange={change} className="w-full h-10 rounded-[9px] border border-line-strong bg-surface px-3 text-[13px]" />
            </label>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="primary" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save alert settings"}</Button>
            {notice && <span className="text-[12px] text-emerald-700">{notice}</span>}
            {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
          </div>
          <p className="text-[11px] text-ink-faint leading-relaxed">An alert repeats until your team replies or verifies/rejects the payment. Messages are held during quiet hours.</p>
        </div>
      )}
    </Panel>
  );
}
