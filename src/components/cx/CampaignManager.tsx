"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Panel, Spinner } from "@/components/cx/ui";
import { Page } from "@/components/cx/Page";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { templateVariableCount } from "@/lib/templates";

type Template = { id: string; name: string; body: string; category: string; status: string };
type Campaign = { id: string; name: string; status: string; estimate: Record<string, number | string> };
const field = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px]";

export function CampaignManager() {
  const { demo } = useDashboard();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [estimate, setEstimate] = useState<Record<string, number | string> | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openCampaign, setOpenCampaign] = useState<Record<string, unknown> | null>(null);
  const [sendingPaused, setSendingPaused] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const selectedTemplate = templates.find((item) => item.id === templateId);

  const reload = useCallback(async () => {
    const [campaignRes, templateRes, groupRes, settingsRes] = await Promise.all([fetch("/api/campaigns"), fetch("/api/templates"), fetch("/api/contact-groups"), fetch("/api/campaigns/settings")]);
    const [campaignData, templateData, groupData, settingsData] = await Promise.all([campaignRes.json().catch(() => ({})), templateRes.json().catch(() => ({})), groupRes.json().catch(() => ({})), settingsRes.json().catch(() => ({}))]);
    if (!campaignRes.ok || !templateRes.ok || !groupRes.ok || !settingsRes.ok) throw new Error(campaignData.error ?? templateData.error ?? groupData.error ?? settingsData.error ?? "Unable to load campaign data");
    setCampaigns(campaignData.campaigns ?? []);
    setTemplates((templateData.templates ?? []).filter((item: Template) => item.status === "approved"));
    setGroups(groupData.groups ?? []);
    setSendingPaused(settingsData.settings?.campaign_sending_paused ?? false);
  }, []);
  useEffect(() => {
    if (demo) return;
    let active = true;
    const endpoints = ["/api/campaigns", "/api/templates", "/api/contact-groups", "/api/campaigns/settings", "/api/me"];
    Promise.all(endpoints.map((url) => fetch(url).then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))))
      .then((results) => {
        const failed = results.find((result) => !result.response.ok);
        if (failed) throw new Error(failed.data.error ?? "Unable to load campaign data");
        if (!active) return;
        setCampaigns(results[0].data.campaigns ?? []); setTemplates((results[1].data.templates ?? []).filter((item: Template) => item.status === "approved"));
        setGroups(results[2].data.groups ?? []); setSendingPaused(results[3].data.settings?.campaign_sending_paused ?? false); setError("");
        setCanManage(results[4].data.user?.role === "admin");
      })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demo]);
  useEffect(() => {
    if (!templateId || demo) return;
    let active = true;
    fetch("/api/campaigns/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId, category: selectedTemplate?.category }) })
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Unable to estimate cost"); if (active) setEstimate(data); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [templateId, groupId, selectedTemplate?.category, demo]);

  async function create(start: boolean) {
    if (demo || !templateId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, templateId, groupId: groupId || null, variables }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Could not create campaign");
      if (start && !window.confirm(`Send to ${data.campaign.estimate.recipientCount} opted-in contacts. Estimated total: ₹${data.campaign.estimate.totalInr}. Continue?`)) { setNotice("Campaign saved as a draft."); await reload(); return; }
      if (start) { const send = await fetch(`/api/campaigns/${data.campaign.id}/send`, { method: "POST" }); const result = await send.json().catch(() => ({})); if (!send.ok) throw new Error(result.error ?? "Could not queue campaign"); }
      setNotice(start ? "Campaign queued. Delivery updates will appear here." : "Campaign saved as a draft."); setName(""); await reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function testSend() {
    const response = await fetch("/api/campaigns/test-send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, variables }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Test send failed"); else setNotice(data.message);
  }
  async function toggleSendingPause() {
    const response = await fetch("/api/campaigns/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !sendingPaused }) });
    const data = await response.json().catch(() => ({})); if (!response.ok) setError(data.error ?? "Could not update pause"); else setSendingPaused(data.campaign_sending_paused);
  }
  async function campaignAction(id: string, action: string) {
    const response = await fetch(`/api/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json().catch(() => ({})); if (!response.ok) setError(data.error ?? "Campaign action failed"); else await reload();
  }
  async function viewCampaign(id: string) {
    const response = await fetch(`/api/campaigns/${id}`); const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Could not load recipients"); else setOpenCampaign(data);
  }

  return <Page wide section="Marketing" title="Campaigns" subtitle="Consent-based WhatsApp broadcasts">
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">{error}</p>}{notice && <p role="status" className="rounded-lg bg-surface p-3 text-[13px]">{notice}</p>}
      {!canManage && <p className="rounded-lg bg-canvas p-3 text-[12px] text-ink-soft">Campaign management is restricted to business admins.</p>}
      <Panel title="New campaign" icon="campaigns" action={canManage ? <Button size="sm" variant={sendingPaused ? "primary" : "danger"} onClick={toggleSendingPause}>{sendingPaused ? "Resume all sends" : "Pause all sends"}</Button> : null}><div className="p-4 space-y-3">
        <label className="block text-[12px] font-semibold">Campaign name<input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-[12px] font-semibold">Approved template<select className={`${field} mt-1`} value={templateId} onChange={(e) => { const value = e.target.value; setTemplateId(value); const template = templates.find((item) => item.id === value); setVariables(Array.from({ length: Math.max(0, template ? templateVariableCount(template.body) : 0) }, () => "")); }}><option value="">Choose template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label><label className="text-[12px] font-semibold">Audience group<select className={`${field} mt-1`} value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">All opted-in contacts</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        {variables.map((value, i) => <label key={i} className="block text-[12px]">Template value for {`{{${i + 1}}}`}<input className={`${field} mt-1`} value={value} onChange={(e) => setVariables((current) => current.map((item, j) => i === j ? e.target.value : item))} placeholder={i === 0 ? "Contact name" : "Shared campaign value"} /></label>)}
        {estimate && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-canvas p-3 text-[12px]"><p>Eligible: <strong>{estimate.count}</strong></p><p>Skipped: <strong>{estimate.skipped}</strong></p><p>Meta estimate: <strong>₹{estimate.metaCostInr}</strong></p><p>Cenexa fee: <strong>₹{estimate.cenexaFeeInr}</strong></p><p className="col-span-2 sm:col-span-4">Estimated total ₹{estimate.totalInr} · rates as of {estimate.asOf}</p></div>}
        {canManage && <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={testSend} disabled={!templateId || demo}>Test send to business number</Button><Button variant="secondary" onClick={() => create(false)} disabled={busy || !name || !templateId || demo}>Save draft</Button><Button onClick={() => create(true)} disabled={busy || !name || !templateId || !estimate || Number(estimate.count) === 0 || demo}>{busy ? "Preparing…" : "Confirm and queue"}</Button></div>}
        <p className="text-[11px] text-ink-faint">Cost is an estimate only. It does not debit a balance. Only contacts with recorded opt-in are eligible.</p>
      </div></Panel>
      <Panel title="Campaign history" icon="history">{loading ? <div className="p-8 flex justify-center"><Spinner /></div> : campaigns.length ? <ul className="divide-y divide-line">{campaigns.map((campaign) => <li key={campaign.id} className="flex items-center gap-3 p-4"><button className="flex-1 text-left" onClick={() => void viewCampaign(campaign.id)}><span className="block text-[13px] font-semibold">{campaign.name}</span><span className="text-[11px] text-ink-faint">{campaign.status} · {campaign.estimate?.recipientCount ?? 0} recipients · ₹{campaign.estimate?.totalInr ?? 0} estimate</span></button>{canManage && campaign.status === "sending" && <Button size="sm" variant="secondary" onClick={() => campaignAction(campaign.id, "pause")}>Pause</Button>}{canManage && campaign.status === "paused" && <Button size="sm" variant="secondary" onClick={() => campaignAction(campaign.id, "resume")}>Resume</Button>}{canManage && ["draft", "sending", "paused", "scheduled"].includes(campaign.status) && <Button size="sm" variant="danger" onClick={() => campaignAction(campaign.id, "cancel")}>Cancel</Button>}</li>)}</ul> : <EmptyState icon="campaigns" title="No campaigns yet" body="Create a campaign above using an approved template." />}</Panel>
      {openCampaign && <Panel title={`Recipients · ${String((openCampaign.campaign as Campaign)?.name ?? "Campaign")}`} icon="checks" action={<Button size="sm" variant="ghost" onClick={() => setOpenCampaign(null)}>Close</Button>}><div className="p-4"><div className="flex flex-wrap gap-3 text-[11px] mb-3">{Object.entries((openCampaign.counts as Record<string, number>) ?? {}).map(([key, val]) => <span key={key}>{key}: <strong>{val}</strong></span>)}</div><div className="max-h-72 overflow-auto"><table className="w-full text-[11px]"><tbody>{((openCampaign.recipients as Array<Record<string, string>>) ?? []).map((row) => <tr key={row.id} className="border-t border-line"><td className="p-2 font-mono">{row.phone}</td><td className="p-2">{row.status}</td><td className="p-2 text-danger">{row.skip_reason ?? row.error_code ?? ""}</td></tr>)}</tbody></table></div></div></Panel>}
    </div>
  </Page>;
}
