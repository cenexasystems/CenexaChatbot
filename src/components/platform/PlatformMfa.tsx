"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TotpFactor = { id: string; status: string; friendly_name?: string };

export function PlatformMfa() {
  const router = useRouter();
  const [factor, setFactor] = useState<TotpFactor | null>(null);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const loadFactors = useCallback(async () => {
    const supabase = createClient();
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) { setError(listError.message); setBusy(false); return; }
    const active = (data.totp ?? []).find((entry) => entry.status === "verified");
    if (active) setFactor(active);
    setBusy(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- factor state is set only after the auth request resolves.
  useEffect(() => { void loadFactors(); }, [loadFactors]);

  async function enroll() {
    setBusy(true); setError("");
    const { data, error: enrollError } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: "Cenexa Platform Admin" });
    if (enrollError) setError(enrollError.message);
    else { setFactor({ id: data.id, status: "unverified", friendly_name: data.friendly_name }); setQr(data.totp.qr_code); setSecret(data.totp.secret); setMessage("Scan the QR in an authenticator app, then enter its six-digit code."); }
    setBusy(false);
  }

  async function verify() {
    if (!factor) return;
    setBusy(true); setError("");
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challengeError) { setError(challengeError.message); setBusy(false); return; }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: code.replace(/\s/g, "") });
    if (verifyError) setError(verifyError.message);
    else { setMessage("MFA verified. Opening the platform console…"); router.replace("/admin"); router.refresh(); }
    setBusy(false);
  }

  return <main className="min-h-dvh bg-[#f6f7f9] p-4 sm:p-8"><section className="mx-auto mt-10 max-w-lg rounded-2xl border bg-white p-6"><Link href="/admin" className="text-sm font-semibold text-blue-700 underline">← Platform console</Link><p className="mt-6 text-xs font-bold uppercase tracking-widest text-blue-700">Platform security</p><h1 className="mt-1 text-2xl font-bold">Multi-factor verification</h1><p className="mt-2 text-sm text-slate-600">A verified authenticator is required for platform administration.</p>
    {busy&&<p className="mt-4 text-sm">Loading authenticator…</p>}
    {!busy&&!factor&&<button onClick={()=>void enroll()} className="mt-5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Set up authenticator</button>}
    {qr&&<div className="mt-5 space-y-3 rounded-xl border bg-slate-50 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns a compact inline SVG data URL for TOTP setup. */}
      <img src={qr} alt="Authenticator setup QR code" className="mx-auto h-48 w-48"/><p className="text-xs text-slate-600">Manual setup key</p><code className="block break-all rounded bg-white p-2 text-sm">{secret}</code></div>}
    {factor&&<form className="mt-5 space-y-3" onSubmit={(event)=>{event.preventDefault();void verify();}}><label className="block text-sm font-semibold">Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required value={code} onChange={(event)=>setCode(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-lg tracking-widest" placeholder="000000" /></label><button disabled={busy} className="w-full rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy?"Verifying…":"Verify MFA"}</button></form>}
    {error&&<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{message&&<p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}</section></main>;
}
