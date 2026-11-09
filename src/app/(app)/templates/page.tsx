"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/cx/Page";
import { Button, Spinner, cx } from "@/components/cx/ui";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { templateVariableCount } from "@/lib/templates";

type SavedTemplate = { id: string; name: string; language: string; category: string; header: string | null; body: string; footer: string | null; buttons: Array<{ type: string; text: string; url?: string }>; examples: string[]; status: string; rejection_reason: string | null };
const fieldClass = "w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-[13px] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";
const sample: SavedTemplate[] = [{ id: "demo-template", name: "appointment_reminder", language: "en", category: "UTILITY", header: null, body: "Hi {{1}}, your appointment is on {{2}}. Reply if you need to change it.", footer: "Thank you", buttons: [{ type: "QUICK_REPLY", text: "Confirm" }], examples: ["Priya", "Monday at 4 PM"], status: "approved", rejection_reason: null }];

export default function TemplatesPage() {
  const router = useRouter();
  const { business, demo } = useDashboard();
  const [templates, setTemplates] = useState<SavedTemplate[]>(demo ? sample : []);
  const [role, setRole] = useState("support");
  const [wabaConfigured, setWabaConfigured] = useState(demo);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [buttonType, setButtonType] = useState("none");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const variableCount = templateVariableCount(body);
  const canManage = role === "admin" || role === "sales";
  const preview = useMemo(() => body.replace(/\{\{(\d+)\}\}/g, (_match, n: string) => examples[Number(n) - 1]?.trim() || `Example ${n}`), [body, examples]);

  const load = useCallback(async () => {
    const [templateResponse, meResponse] = await Promise.all([fetch("/api/templates"), fetch("/api/me")]);
    const templateData = await templateResponse.json().catch(() => ({}));
    if (!templateResponse.ok) throw new Error(templateData.error ?? "Could not load templates");
    const me = await meResponse.json().catch(() => ({}));
    setError("");
    setRole(me.user?.role ?? "support");
    setTemplates(templateData.templates ?? []);
    setWabaConfigured(Boolean(templateData.wabaConfigured));
  }, []);

  useEffect(() => { if (business && !business.modules_enabled?.templates) router.replace("/more"); }, [business, router]);
  useEffect(() => {
    if (demo || !business?.modules_enabled?.templates) return;
    let active = true;
    Promise.all([fetch("/api/templates"), fetch("/api/me")])
      .then(async ([templateResponse, meResponse]) => {
        const templateData = await templateResponse.json().catch(() => ({}));
        if (!templateResponse.ok) throw new Error(templateData.error ?? "Could not load templates");
        const me = await meResponse.json().catch(() => ({}));
        if (!active) return;
        setTemplates(templateData.templates ?? []);
        setWabaConfigured(Boolean(templateData.wabaConfigured));
        setRole(me.user?.role ?? "support");
        setError("");
      })
      .catch((e) => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [business?.modules_enabled?.templates, demo]);

  async function save(submit: boolean) {
    if (demo) { setNotice("Demo mode: nothing was saved or sent."); return; }
    setBusy(true); setError(""); setNotice("");
    const buttons = buttonType === "none" ? [] : [{ type: buttonType, text: buttonText, ...(buttonType === "URL" ? { url: buttonUrl } : {}) }];
    try {
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submit, template: { name, language, category, header, body, footer, buttons, examples } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save template");
      setNotice(submit ? "Submitted to Meta for review." : "Draft saved.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function sync() {
    setSyncBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/templates/sync", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not sync templates");
      setNotice(`Synced ${result.synced} template${result.synced === 1 ? "" : "s"} from Meta.`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setSyncBusy(false); }
  }

  async function remove(template: SavedTemplate) {
    if (demo || !window.confirm(`Delete “${template.name}” from WhatsApp and ChatFlow?`)) return;
    const response = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error ?? "Could not delete template");
    else { setNotice("Template deleted."); await load(); }
  }

  if (!business?.modules_enabled?.templates) return <div className="h-full flex items-center justify-center"><Spinner /></div>;

  return <Page wide section="Operations" title="Message templates" subtitle="Manage WhatsApp approvals and reusable customer messages" action={<Button variant="secondary" onClick={sync} disabled={syncBusy || demo}>{syncBusy ? "Syncing…" : "Sync from Meta"}</Button>}>
    <div className="space-y-5">
      {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">{notice}</div>}
      {!wabaConfigured && !demo && <div className="rounded-xl border border-attention/30 bg-attention/10 px-4 py-3 text-[13px]">WhatsApp needs reconnection before templates can be submitted or synced. You can still save drafts.</div>}
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4"><div><h2 className="text-[16px] font-bold">Create a template</h2><p className="text-[12px] text-ink-faint mt-1">Use sequential variables such as <code>{"{{1}}"}</code>. Meta reviews submitted templates.</p></div></div>
        {!canManage && !demo ? <p className="text-[13px] text-ink-faint">Your role can send approved templates. Ask an admin or sales teammate to create them.</p> : <>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-[12px] font-semibold">Template name<input className={`${fieldClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="appointment_reminder" /></label>
            <label className="text-[12px] font-semibold">Language code<input className={`${fieldClass} mt-1`} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en or en_US" /></label>
            <label className="text-[12px] font-semibold">Category<select className={`${fieldClass} mt-1`} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}><option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option></select></label>
            <label className="text-[12px] font-semibold">Header (optional)<input className={`${fieldClass} mt-1`} value={header} onChange={(e) => setHeader(e.target.value)} maxLength={60} placeholder="Appointment reminder" /></label>
            <label className="text-[12px] font-semibold sm:col-span-2">Body<textarea className={`${fieldClass} mt-1 min-h-24`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1024} placeholder="Hi {{1}}, your appointment is on {{2}}." /></label>
            {variableCount > 0 && <div className="sm:col-span-2 grid sm:grid-cols-2 gap-3"><p className="sm:col-span-2 text-[12px] font-semibold">Example values required by Meta</p>{Array.from({ length: variableCount }, (_, i) => <label key={i} className="text-[12px]">Value for {`{{${i + 1}}}`}<input className={`${fieldClass} mt-1`} value={examples[i] ?? ""} onChange={(e) => setExamples((current) => Array.from({ length: variableCount }, (_, index) => index === i ? e.target.value : current[index] ?? ""))} /></label>)}</div>}
            {variableCount < 0 && <p className="sm:col-span-2 text-[12px] text-danger">Variables must be sequential, starting at {`{{1}}`}.</p>}
            <label className="text-[12px] font-semibold">Footer (optional)<input className={`${fieldClass} mt-1`} value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} /></label>
            <label className="text-[12px] font-semibold">Button (optional)<select className={`${fieldClass} mt-1`} value={buttonType} onChange={(e) => setButtonType(e.target.value)}><option value="none">No button</option><option value="QUICK_REPLY">Quick reply</option><option value="URL">Website URL</option></select></label>
            {buttonType !== "none" && <label className="text-[12px] font-semibold">Button label<input className={`${fieldClass} mt-1`} value={buttonText} onChange={(e) => setButtonText(e.target.value)} maxLength={25} /></label>}
            {buttonType === "URL" && <label className="text-[12px] font-semibold">HTTPS URL<input className={`${fieldClass} mt-1`} value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} placeholder="https://example.com" /></label>}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-canvas p-4"><p className="eyebrow !text-[9px] mb-2">Live preview</p>{header && <p className="font-bold text-[13px] mb-1">{header}</p>}<p className="whitespace-pre-wrap text-[13px]">{preview || "Your message preview appears here."}</p>{footer && <p className="text-[11px] text-ink-faint mt-2">{footer}</p>}{buttonText && <span className="inline-block mt-3 border-t border-line pt-2 text-[12px] text-accent">{buttonText}</span>}</div>
          <div className="flex flex-wrap justify-end gap-2 mt-4"><Button variant="secondary" onClick={() => save(false)} disabled={busy || demo}>{busy ? <Spinner size={14} /> : null}Save draft</Button><Button variant="primary" onClick={() => save(true)} disabled={busy || demo || !wabaConfigured || variableCount < 0}>{busy ? <Spinner size={14} /> : null}Submit for approval</Button></div>
        </>}
      </section>
      <section className="rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-line"><div><h2 className="text-[16px] font-bold">Your templates</h2><p className="text-[12px] text-ink-faint mt-1">Only approved templates can be sent in chats.</p></div><span className="text-[12px] text-ink-faint">{templates.length} total</span></div>
        {loading ? <div className="flex justify-center p-10"><Spinner /></div> : templates.length === 0 ? <div className="p-8 text-center text-[13px] text-ink-faint">No templates yet. Create one above or sync from Meta.</div> : <ul className="divide-y divide-line">{templates.map((template) => <li key={template.id} className="px-4 sm:px-6 py-4"><div className="flex items-start gap-3"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-[13px]">{template.name}</h3><span className={cx("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", template.status === "approved" ? "bg-emerald-100 text-emerald-800" : template.status === "rejected" ? "bg-danger-tint text-danger" : "bg-canvas text-ink-soft")}>{template.status}</span><span className="text-[10px] uppercase text-ink-faint">{template.language} · {template.category}</span></div><p className="mt-2 whitespace-pre-wrap text-[12.5px] text-ink-soft">{template.body}</p>{template.rejection_reason && <p className="mt-2 text-[12px] text-danger">Meta feedback: {template.rejection_reason}</p>}</div>{canManage && !demo && <button onClick={() => remove(template)} className="text-[12px] font-semibold text-danger hover:underline">Delete</button>}</div></li>)}</ul>}
      </section>
    </div>
  </Page>;
}
