"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Panel } from "@/components/cx/ui";

export function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) { setError(updateError.message); return; }
      setPassword(""); setConfirm(""); setNotice("Password changed.");
    } catch {
      setError("Could not change your password. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  return <Panel title="Change password" icon="user">
    <form onSubmit={save} className="space-y-3 p-4">
      <label className="block text-[11px] font-semibold">New password<input type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-10 w-full rounded-[9px] border border-line-strong bg-surface px-3 text-[13px]" /></label>
      <label className="block text-[11px] font-semibold">Confirm new password<input type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-1 h-10 w-full rounded-[9px] border border-line-strong bg-surface px-3 text-[13px]" /></label>
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-[11px] text-ink-soft"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />Show passwords</label><Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>{notice && <span role="status" className="text-[12px] text-emerald-700">{notice}</span>}{error && <span role="alert" className="text-[12px] text-danger">{error}</span>}</div>
    </form>
  </Panel>;
}
