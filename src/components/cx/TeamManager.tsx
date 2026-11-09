"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, EmptyState, Panel, Spinner } from "@/components/cx/ui";
import { Page } from "@/components/cx/Page";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { demoTeamMembers } from "@/lib/demo-data";

type TeamRole = "admin" | "support" | "sales" | "accounts";
type Member = { id: string; name: string | null; email: string | null; role: TeamRole; status: "invited" | "active" | "disabled"; invited_at: string | null };
const ROLES: TeamRole[] = ["admin", "support", "sales", "accounts"];
const field = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[12px]";

export function TeamManager() {
  const { demo, role, userId, updateBusiness } = useDashboard();
  const admin = role === "admin";
  const [members, setMembers] = useState<Member[]>(() => demo ? demoTeamMembers : []);
  const [strictRoles, setStrictRoles] = useState(false);
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [newRole, setNewRole] = useState<TeamRole>("support");
  const [loading, setLoading] = useState(!demo); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const reload = useCallback(async () => {
    const response = await fetch("/api/team"); const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Could not load team"); setMembers(data.members ?? []); setStrictRoles(data.strictRoles ?? false);
  }, []);
  useEffect(() => { if (demo) return; let live = true; fetch("/api/team").then(async (response) => ({ response, data: await response.json().catch(() => ({})) })).then(({ response, data }) => { if (!response.ok) throw new Error(data.error ?? "Could not load team"); if (live) { setMembers(data.members ?? []); setStrictRoles(data.strictRoles ?? false); } }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [demo]);

  async function invite(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try { const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, role: newRole }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Invitation failed"); setEmail(""); setName(""); setNotice(`Invitation sent to ${data.invited.email}.`); await reload(); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  async function changeMember(member: Member, patch: { role?: TeamRole; status?: "active" | "disabled" }) {
    setError(""); setNotice("");
    try { const response = await fetch(`/api/team/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Team update failed"); if (data.warning) setNotice(data.warning); else setNotice("Team member updated."); if (member.id === userId) window.location.reload(); await reload(); }
    catch (e) { setError((e as Error).message); }
  }
  async function toggleStrict() {
    const response = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strictRoles: !strictRoles }) }); const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Could not update role enforcement"); else { setStrictRoles(data.strictRoles); updateBusiness({ strict_roles: data.strictRoles }); setNotice(`Strict role enforcement ${data.strictRoles ? "enabled" : "disabled"}.`); }
  }

  return <Page wide section="Operations" title="Team" subtitle="Invite staff and set business roles">
    {error && <p role="alert" className="mb-4 rounded-lg bg-danger-tint p-3 text-[13px] text-danger">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg bg-surface p-3 text-[13px]">{notice}</p>}
    {loading ? <div className="flex justify-center p-10"><Spinner /></div> : <div className="space-y-4">
      {!admin && <p className="rounded-lg bg-canvas p-3 text-[12px] text-ink-soft">Only business admins can invite staff or change roles.</p>}
      <Panel title="Role enforcement" icon="team"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-[13px] font-semibold">Strict roles are {strictRoles ? "on" : "off"}</p><p className="text-[11px] text-ink-faint">When enabled, permissions follow each member’s role across inbox, payments, and settings.</p></div>{admin && <Button variant={strictRoles ? "danger" : "primary"} onClick={toggleStrict} disabled={demo}>{strictRoles ? "Turn off strict roles" : "Enable strict roles"}</Button>}</div></Panel>
      {admin && <Panel title="Invite a teammate" icon="team"><form onSubmit={invite} className="grid gap-3 p-4 sm:grid-cols-2"><label className="text-[11px]">Full name<input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label><label className="text-[11px]">Email<input className={`${field} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required /></label><label className="text-[11px]">Role<select className={`${field} mt-1`} value={newRole} onChange={(e) => setNewRole(e.target.value as TeamRole)}>{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><div className="flex items-end justify-end"><Button type="submit" disabled={saving || demo}>{saving ? "Sending invite…" : "Send invitation"}</Button></div></form></Panel>}
      <Panel title="Business members" icon="team">{members.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-[12px]"><thead className="text-[10px] text-ink-faint"><tr><th className="p-3">Member</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Access</th></tr></thead><tbody className="divide-y divide-line">{members.map((member) => <tr key={member.id}><td className="p-3"><p className="font-semibold">{member.name || "Team member"}</p><p className="text-ink-faint">{member.email || "Email unavailable"}</p></td><td className="p-3">{admin ? <select disabled={demo} className={field} value={member.role} onChange={(e) => void changeMember(member, { role: e.target.value as TeamRole })}>{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select> : member.role}</td><td className="p-3 capitalize">{member.status}</td><td className="p-3">{admin && <Button size="sm" variant={member.status === "disabled" ? "primary" : "danger"} disabled={demo} onClick={() => void changeMember(member, { status: member.status === "disabled" ? "active" : "disabled" })}>{member.status === "disabled" ? "Reactivate" : "Deactivate"}</Button>}</td></tr>)}</tbody></table></div> : <EmptyState icon="team" title="No team members" body="Invited staff appear here after the invitation is created." />}</Panel>
    </div>}
  </Page>;
}
