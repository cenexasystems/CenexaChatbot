"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Button, Chip, EmptyState, Panel, Spinner, Tag } from "@/components/cx/ui";
import { Page } from "@/components/cx/Page";
import { Icon } from "@/components/cx/icons";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { parseContactsCsv } from "@/lib/contacts";
import { formatPhone } from "@/lib/inbox";

type Contact = { id: string; phone: string; name: string | null; tags: string[]; opt_in_at: string | null; updated_at: string };
type Group = { id: string; name: string };
const inputClass = "rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[13px] focus:outline-none focus:border-accent";

export function ContactsManager() {
  const { demo } = useDashboard();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [group, setGroup] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({ name: -1, phone: -1, tags: -1, group: -1 });
  const [consent, setConsent] = useState(false);
  const [consentSource, setConsentSource] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; skippedRows: Array<{ line: number; phone: string; reason: string }> } | null>(null);

  const load = useCallback(async (append = false) => {
    if (demo) return;
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query.trim()) params.set("q", query.trim());
      if (tag) params.set("tag", tag);
      if (group) params.set("group", group);
      if (append && cursor) params.set("cursor", cursor);
      const [contactResponse, groupResponse] = await Promise.all([fetch(`/api/contacts?${params}`), fetch("/api/contact-groups")]);
      const [contactData, groupData] = await Promise.all([contactResponse.json().catch(() => ({})), groupResponse.json().catch(() => ({}))]);
      if (!contactResponse.ok || !groupResponse.ok) throw new Error(contactData.error ?? groupData.error ?? "Could not load contacts");
      setError("");
      setContacts((current) => append ? [...current, ...(contactData.contacts ?? [])] : contactData.contacts ?? []);
      setCursor(contactData.nextCursor ?? null);
      setGroups(groupData.groups ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [demo, query, tag, group, cursor]);

  useEffect(() => {
    if (demo) return;
    let active = true;
    const params = new URLSearchParams({ limit: "50" });
    if (query.trim()) params.set("q", query.trim());
    if (tag) params.set("tag", tag);
    if (group) params.set("group", group);
    Promise.all([fetch(`/api/contacts?${params}`), fetch("/api/contact-groups")])
      .then(async ([contactResponse, groupResponse]) => {
        const [contactData, groupData] = await Promise.all([contactResponse.json().catch(() => ({})), groupResponse.json().catch(() => ({}))]);
        if (!contactResponse.ok || !groupResponse.ok) throw new Error(contactData.error ?? groupData.error ?? "Could not load contacts");
        if (!active) return;
        setContacts(contactData.contacts ?? []); setCursor(contactData.nextCursor ?? null); setGroups(groupData.groups ?? []); setError("");
      })
      .catch((e) => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demo, query, tag, group]);

  async function chooseFile(nextFile: File | null) {
    setFile(nextFile); setSummary(null); setConsent(false); setCsv(""); setHeaders([]);
    if (!nextFile) return;
    const text = await nextFile.text();
    try {
      const parsed = parseContactsCsv(text, { phone: 0 });
      setCsv(text); setHeaders(parsed.headers);
      const find = (...keys: string[]) => parsed.headers.findIndex((header) => keys.includes(header));
      setMapping({ name: find("name", "full name", "customer", "contact"), phone: find("phone", "phone number", "mobile", "mobile number", "whatsapp"), tags: find("tags", "tag", "labels", "label"), group: find("group", "group name", "list") });
    } catch (e) { setError((e as Error).message); }
  }

  async function importCsv() {
    if (!file || !csv || !consent || mapping.phone < 0 || demo) return;
    setImporting(true); setError(""); setSummary(null);
    try {
      const response = await fetch("/api/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, mapping, consentConfirmed: consent, consentSource }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Import failed");
      setSummary({ imported: data.imported, skippedRows: data.skippedRows ?? [] });
      setFile(null); setCsv(""); setHeaders([]); setConsent(false);
      await load(false);
    } catch (e) { setError((e as Error).message); }
    finally { setImporting(false); }
  }

  async function createGroup() {
    const name = window.prompt("New contact group name");
    if (!name?.trim() || demo) return;
    const response = await fetch("/api/contact-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Could not create group");
    else await load(false);
  }

  function downloadSkipped() {
    if (!summary?.skippedRows.length) return;
    const csvText = ["line,phone,reason", ...summary.skippedRows.map((row) => `${row.line},"${row.phone.replaceAll('"', '""')}","${row.reason.replaceAll('"', '""')}"`)].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csvText], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "contacts-skipped.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  const tags = [...new Set(contacts.flatMap((contact) => contact.tags ?? []))].sort();
  const previewRows = useMemo(() => {
    if (!csv) return [];
    try { return parseContactsCsv(csv, mapping).rows.slice(0, 5); } catch { return []; }
  }, [csv, mapping]);
  return <Page wide section="Customers" title="Contacts" subtitle="Import, organize, and track customer consent" action={<Button icon="upload" onClick={() => document.getElementById("contacts-csv")?.click()}>Import CSV</Button>}>
    <input id="contacts-csv" type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
    {error && <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger">{error}</div>}
    {summary && <div role="status" className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">Imported {summary.imported}; skipped {summary.skippedRows.length}. {summary.skippedRows.length > 0 && <button onClick={downloadSkipped} className="ml-2 font-semibold text-accent underline">Download skipped rows</button>}</div>}
    {file && <Panel className="mb-4" title="Preview CSV import" icon="upload">
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-ink-soft">{file.name} · {headers.length} columns · previewing first 5 rows</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(["name", "phone", "tags", "group"] as const).map((field) => <label key={field} className="text-[11px] font-semibold capitalize">{field} column<select className={`${inputClass} mt-1 w-full`} value={mapping[field]} onChange={(e) => setMapping((current) => ({ ...current, [field]: Number(e.target.value) }))}><option value={-1}>Not mapped</option>{headers.map((header, i) => <option key={i} value={i}>{header || `Column ${i + 1}`}</option>)}</select></label>)}</div>
        {previewRows.length > 0 && <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full text-left text-[11px]"><thead className="bg-canvas"><tr>{["Name", "Phone", "Tags", "Group"].map((label) => <th key={label} className="px-2 py-1.5">{label}</th>)}</tr></thead><tbody>{previewRows.map((row) => <tr key={row.line} className="border-t border-line"><td className="px-2 py-1.5">{row.name || "—"}</td><td className="px-2 py-1.5 font-mono">{row.phone}</td><td className="px-2 py-1.5">{row.tags.join(", ") || "—"}</td><td className="px-2 py-1.5">{row.group || "—"}</td></tr>)}</tbody></table></div>}
        <p className="text-[11px] text-ink-faint">Phone formats accepted: 10-digit India numbers, 91-prefixed numbers, leading 0, or international numbers.</p>
        <label className="flex items-start gap-2 text-[12px]"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" /><span>I confirm these contacts opted in to receive WhatsApp messages. This import records that consent.</span></label>
        <input className={`${inputClass} w-full`} value={consentSource} onChange={(e) => setConsentSource(e.target.value)} placeholder="Consent source (e.g. website form, in-store signup)" />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setFile(null)}>Cancel</Button><Button onClick={importCsv} disabled={!consent || mapping.phone < 0 || importing || demo}>{importing ? "Importing…" : "Import contacts"}</Button></div>
      </div>
    </Panel>}
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <label className="flex items-center gap-2 h-10 px-3 rounded-[10px] border border-line-strong bg-surface sm:w-72"><Icon name="search" size={16} className="text-ink-faint" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or number" className="flex-1 bg-transparent text-[13px] focus:outline-none" /></label>
      <select className={inputClass} value={group} onChange={(e) => { setGroup(e.target.value); setCursor(null); }}><option value="">All groups</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <Button variant="secondary" size="sm" onClick={createGroup} disabled={demo}>New group</Button>
      {tags.length > 0 && <div className="flex gap-2 overflow-x-auto">{tags.map((item) => <Chip key={item} active={tag === item} onClick={() => { setTag(tag === item ? "" : item); setCursor(null); }}>{item}</Chip>)}</div>}
    </div>
    <Panel title="All contacts" icon="contacts" meta={<span className="text-[11px] text-ink-faint">{contacts.length} shown</span>}>
      {loading ? <div className="flex justify-center p-10"><Spinner /></div> : contacts.length === 0 ? <EmptyState icon="contacts" title="No contacts yet" body="Import a consented CSV or wait for customers to message you." /> : <ul className="divide-y divide-line">{contacts.map((contact) => <li key={contact.id}><Link href={`/contacts/${contact.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas"><Avatar name={contact.name} phone={contact.phone} size={34} /><div className="flex-1 min-w-0"><p className="text-[13px] font-semibold truncate">{contact.name || "No name"}</p><p className="text-[11px] text-ink-faint font-mono">{formatPhone(contact.phone)}</p></div><div className="hidden sm:flex gap-1">{contact.tags?.slice(0, 3).map((item) => <Tag key={item}>{item}</Tag>)}</div><span className="text-[11px]">{contact.opt_in_at ? "Opted in" : "No opt-in"}</span></Link></li>)}</ul>}
      {cursor && !loading && <div className="p-4 text-center"><Button variant="secondary" onClick={() => void load(true)}>Load more</Button></div>}
    </Panel>
  </Page>;
}
