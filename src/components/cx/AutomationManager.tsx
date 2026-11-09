"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Panel, Spinner } from "@/components/cx/ui";
import { Page } from "@/components/cx/Page";
import { useDashboard } from "@/components/cx/DashboardProvider";

type Rule = { id?: string; rule_type: string; enabled: boolean; config: Record<string, unknown> };
const CATALOG = [
  ["follow_up", "Unanswered chat follow-up", "Follow up when a customer message has not received a team reply."],
  ["payment_reminder", "Payment reminder", "Remind after a QR was sent and payment is still pending."],
  ["review_request", "Review request", "Ask for a review after payment verification."],
  ["dated_reminder", "Dated reminder", "Schedule a reminder manually from a contact timeline."],
];
const field = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[12px]";

export function AutomationManager() {
  const { demo } = useDashboard();
  const [rules, setRules] = useState<Rule[]>(CATALOG.map(([rule_type]) => ({ rule_type, enabled: false, config: { delay_minutes: 1440, message: "", template_id: "", quiet_hours_start: "21:00", quiet_hours_end: "09:00" } })));
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [runs, setRuns] = useState<Array<Record<string, string | number>>>();
  const [matches, setMatches] = useState<Array<Record<string, string>>>([]);
  const [selectedRule, setSelectedRule] = useState("follow_up");
  const [loading, setLoading] = useState(!demo);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const reload = useCallback(async () => {
    const [response, templateResponse, meResponse] = await Promise.all([fetch("/api/automations"), fetch("/api/templates"), fetch("/api/me")]);
    const [data, templateData, meData] = await Promise.all([response.json().catch(() => ({})), templateResponse.json().catch(() => ({})), meResponse.json().catch(() => ({}))]);
    if (!response.ok || !templateResponse.ok || !meResponse.ok) throw new Error(data.error ?? templateData.error ?? meData.error ?? "Could not load automation settings");
    setRules((current) => current.map((rule) => data.automations.find((saved: Rule) => saved.rule_type === rule.rule_type) ?? rule));
    setRuns(data.runs ?? []); setTemplates((templateData.templates ?? []).filter((item: { status: string }) => item.status === "approved"));
    setCanManage(meData.user?.role === "admin");
  }, []);
  useEffect(() => { if (demo) return; let live = true; reload().catch((e) => setError(e.message)).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [demo, reload]);
  function update(ruleType: string, update: Partial<Rule>) { setRules((current) => current.map((rule) => rule.rule_type === ruleType ? { ...rule, ...update, config: { ...rule.config, ...(update.config ?? {}) } } : rule)); }
  async function save() {
    setSaving(true); setError(""); setNotice("");
    try { const response = await fetch("/api/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ automations: rules }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Save failed"); setNotice("Automation rules saved."); await reload(); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  async function dryRun() {
    const response = await fetch("/api/automations/dry-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleType: selectedRule }) }); const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Dry run failed"); else setMatches(data.matches ?? []);
  }
  return <Page wide section="Operations" title="Automations" subtitle="Fixed, reviewable customer follow-up rules">
    {error && <p role="alert" className="mb-4 rounded-lg bg-danger-tint p-3 text-[13px] text-danger">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg bg-surface p-3 text-[13px]">{notice}</p>}
    {loading ? <div className="flex justify-center p-10"><Spinner /></div> : <div className="space-y-4">
      {!canManage && <p className="rounded-lg bg-canvas p-3 text-[12px] text-ink-soft">Automation management is restricted to business admins.</p>}
      {rules.map((rule) => { const meta = CATALOG.find(([key]) => key === rule.rule_type)!; return <Panel key={rule.rule_type} title={meta[1]} icon="flow"><div className="p-4 space-y-3"><p className="text-[12px] text-ink-faint">{meta[2]}</p><label className="flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" disabled={!canManage} checked={rule.enabled} onChange={(e) => update(rule.rule_type, { enabled: e.target.checked })} />Enabled</label><div className="grid sm:grid-cols-2 gap-3"><label className="text-[11px]">Delay (minutes)<input disabled={!canManage} className={`${field} mt-1`} type="number" min={5} max={43200} value={Number(rule.config.delay_minutes ?? 1440)} onChange={(e) => update(rule.rule_type, { config: { delay_minutes: Number(e.target.value) } })} /></label><label className="text-[11px]">Approved template<select disabled={!canManage} className={`${field} mt-1`} value={String(rule.config.template_id ?? "")} onChange={(e) => update(rule.rule_type, { config: { template_id: e.target.value } })}><option value="">None</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div><label className="block text-[11px]">Text sent inside 24-hour window<textarea disabled={!canManage} className={`${field} mt-1 min-h-16`} value={String(rule.config.message ?? "")} onChange={(e) => update(rule.rule_type, { config: { message: e.target.value } })} placeholder="Hi {{name}}, just checking in…" /></label><div className="grid grid-cols-2 gap-3"><label className="text-[11px]">Quiet hours start<input disabled={!canManage} className={`${field} mt-1`} type="time" value={String(rule.config.quiet_hours_start ?? "21:00")} onChange={(e) => update(rule.rule_type, { config: { quiet_hours_start: e.target.value } })} /></label><label className="text-[11px]">Quiet hours end<input disabled={!canManage} className={`${field} mt-1`} type="time" value={String(rule.config.quiet_hours_end ?? "09:00")} onChange={(e) => update(rule.rule_type, { config: { quiet_hours_end: e.target.value } })} /></label></div></div></Panel>; })}
      {canManage && <div className="flex justify-end"><Button onClick={save} disabled={saving || demo}>{saving ? "Saving…" : "Save rules"}</Button></div>}
      {canManage && <Panel title="Dry run" icon="search"><div className="p-4 flex flex-wrap gap-2"><select className={`${field} max-w-sm`} value={selectedRule} onChange={(e) => setSelectedRule(e.target.value)}>{CATALOG.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><Button variant="secondary" onClick={dryRun} disabled={demo}>Show matching chats</Button><p className="basis-full text-[11px] text-ink-faint">Dry run only lists candidates; it never sends messages.</p>{matches.map((item) => <p key={item.id} className="basis-full text-[12px]">{item.name || item.phone} — {item.reason}</p>)}</div></Panel>}
      <Panel title="Recent runs" icon="history">{runs?.length ? <ul className="divide-y divide-line">{runs.map((run) => <li key={String(run.id)} className="flex justify-between gap-2 p-3 text-[11px]"><span>{String(run.trigger_event_key)}</span><span>{String(run.status)}{run.reason ? ` · ${String(run.reason)}` : ""}</span></li>)}</ul> : <EmptyState icon="history" title="No automation runs" body="Queued, sent, skipped, and cancelled runs appear here." />}</Panel>
    </div>}
  </Page>;
}
