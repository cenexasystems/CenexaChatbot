"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Tenant = { id: string; name: string; plan: string; is_active: boolean; platform_suspended: boolean; whatsapp_number: string | null; onboarding_type: string | null; disconnected_reason: string | null; last_customer_message_at: string | null; messages_30d: number; open_owner_alerts: number; modules_enabled: Record<string, boolean> | null };
type Overview = { role: "owner" | "support" | "read_only"; tenants: Tenant[]; summary: { tenantCount: number; activeCount: number; byPlan: Record<string, number>; sendingCampaigns: number; pendingTemplates: number; messagesByDay: { date: string; inbound: number; aiCalls:number; ai: number; mediaAi:number; team: number; templates:number; campaigns:number }[] }; cron: { job: string; last_started_at: string | null; last_success_at: string | null; last_error: string | null }[]; recentAudit: { id:number; actor_id:string; tenant_id:string|null; action:string; reason:string; created_at:string }[] };

export function PlatformOverview() {
  const [data, setData] = useState<Overview | null>(null); const [error, setError] = useState(""); const [mfaRequired, setMfaRequired] = useState(false); const [q, setQ] = useState(""); const [filter, setFilter] = useState("all"); const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== "all" ? { filter } : {}) })}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : `Platform access is unavailable (${response.status})`);
        setMfaRequired(body?.code === "MFA_REQUIRED");
      } else if (!body || !Array.isArray(body.tenants) || !body.summary || !Array.isArray(body.cron) || !Array.isArray(body.recentAudit)) {
        setError("The platform overview returned an unexpected response. Try again or check the server logs.");
        setMfaRequired(false);
      } else {
        setError("");
        setMfaRequired(false);
        setData(body);
      }
    } catch {
      setError("Could not load the platform overview. Check your connection and try again.");
      setMfaRequired(false);
    } finally {
      setBusy(false);
    }
  }, [q, filter]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load updates state only after the asynchronous fetch settles.
  useEffect(() => { void load(); }, [load]);
  return <main className="min-h-dvh bg-[#f6f7f9] p-4 sm:p-8 text-slate-900"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Cenexa · platform</p><h1 className="mt-1 text-3xl font-bold">Tenant operations</h1><p className="mt-1 text-sm text-slate-600">Metadata and counts only. Customer conversation content is not shown.</p></div>{data && <span className="flex items-center gap-3 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase">{data.role.replace("_", " ")} · MFA verified{data.role==="owner"&&<Link href="/admin/platform-admins" className="underline">Manage admins</Link>}</span>}</header>
    {busy && !data && <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading platform overview…</section>}
    {error && <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}{mfaRequired&&<Link className="ml-2 font-bold underline" href="/admin/mfa">Set up or verify MFA</Link>}{!mfaRequired&&<button className="ml-3 font-bold underline" onClick={()=>void load()}>Try again</button>}</section>}
    {data && <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">{[["Tenants",data.summary.tenantCount],["Active",data.summary.activeCount],["Sending campaigns",data.summary.sendingCampaigns],["Templates pending",data.summary.pendingTemplates],["Plans",Object.entries(data.summary.byPlan).map(([k,v])=>`${k} ${v}`).join(" · ")||"—"]].map(([label,value])=><article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-xl">{value}</strong></article>)}</section>
      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-wrap gap-3 border-b border-slate-200 p-4"><input aria-label="Search tenants" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search name or number" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><select aria-label="Tenant filter" value={filter} onChange={(e)=>setFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">All tenants</option><option value="disconnected">Disconnected</option><option value="suspended">Suspended</option><option value="no_recent_traffic">No recent traffic</option></select><button className="rounded-lg border px-3 text-sm font-semibold" onClick={()=>void load()}>Refresh</button></div>
          {busy ? <p className="p-6 text-sm text-slate-500">Loading tenants…</p> : data.tenants.length ? <div className="divide-y divide-slate-100">{data.tenants.map((tenant)=><Link key={tenant.id} href={`/admin/${tenant.id}`} className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[1fr_130px_110px_150px]"><span><strong className="block">{tenant.name}</strong><span className="text-xs text-slate-500">{tenant.whatsapp_number || "No number"} · {tenant.onboarding_type || "unknown setup"}</span></span><span className="text-sm">{tenant.plan}</span><span className={`text-sm font-semibold ${tenant.platform_suspended?"text-red-700":"text-emerald-700"}`}>{tenant.platform_suspended?"Suspended":tenant.is_active?"Active":"Disconnected"}</span><span className="text-xs text-slate-500">{tenant.messages_30d} messages · {tenant.open_owner_alerts} alerts</span></Link>)}</div> : <p className="p-6 text-sm text-slate-500">{filter === "no_recent_traffic" ? "No tenant has gone 30 days without a customer message." : "No tenants match this filter."} <button onClick={() => setFilter("all")} className="ml-1 font-semibold text-blue-700 underline">Show all tenants</button></p>}</div>
        <aside className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Scheduled jobs</h2>{data.cron.length ? <ul className="mt-3 divide-y">{data.cron.map((job)=><li key={job.job} className="py-3 text-xs"><strong className="block">{job.job}</strong><span className="text-slate-500">Last success: {job.last_success_at ? new Date(job.last_success_at).toLocaleString():"Never recorded"}</span>{job.last_error&&<span className="mt-1 block text-red-700">Latest error: {job.last_error}</span>}</li>)}</ul>:<p className="mt-2 text-xs text-slate-500">No cron heartbeat recorded yet.</p>}<h2 className="mt-5 font-bold">Recent usage</h2><ul className="mt-2 max-h-72 space-y-2 overflow-auto">{data.summary.messagesByDay.slice(-30).reverse().map((day)=><li key={day.date} className="border-b border-slate-100 pb-2 text-xs"><span className="block font-semibold">{day.date}</span><span>in {day.inbound} · AI call proxy {day.aiCalls} · replies {day.ai} · media AI analyses {day.mediaAi} · team {day.team}</span><span className="block text-slate-500">templates {day.templates} · campaigns {day.campaigns}</span></li>)}</ul></aside>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Recent platform actions</h2>{data.recentAudit.length?<ul className="mt-3 divide-y">{data.recentAudit.slice(0,20).map((entry)=><li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-xs"><span><strong>{entry.action}</strong><span className="ml-2 text-slate-500">{entry.tenant_id??"Platform access"}</span><span className="ml-2">{entry.reason}</span></span><span className="text-slate-500">{new Date(entry.created_at).toLocaleString()}</span></li>)}</ul>:<p className="mt-2 text-sm text-slate-500">No platform actions have been recorded.</p>}</section>
    </>}
  </div></main>;
}
