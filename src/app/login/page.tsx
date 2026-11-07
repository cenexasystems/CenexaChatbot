"use client";

import { useState } from "react";
import Image from "next/image";
import { login, signup } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(null);
    try {
      const result = await (mode === "login" ? login : signup)(formData);
      if (result?.error) setError(result.error);
    } catch (err) {
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
      setError("We could not sign you in. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#EFF7FC] px-4 py-8 sm:px-8 flex items-center justify-center">
      <div className="w-full max-w-5xl min-h-[620px] overflow-hidden rounded-[28px] border border-[#B9E2F5] bg-white shadow-[0_24px_80px_rgba(15,75,120,0.14)] grid md:grid-cols-2">
        <section className="relative flex flex-col justify-between overflow-hidden bg-[#0B4B70] p-8 text-white sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#13A6D5]/20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
              <Image src="/brand/cenexa-mark.png" alt="Cenexa" width={44} height={44} className="h-full w-full object-contain" priority />
            </span>
            <span>
              <span className="block font-[var(--font-michroma)] text-lg tracking-[0.08em]">CENEXA</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.34em] text-[#69D5F2]">ChatFlow</span>
            </span>
          </div>
          <div className="relative my-12">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#73D8F2]">WhatsApp workspace</p>
            <h1 className="mt-5 max-w-md text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Your customer conversations, all in one place.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-white/80">
              Reply to customers, manage your inbox, and set up your AI assistant from one simple dashboard.
            </p>
          </div>
          <div className="relative flex items-center gap-2 text-sm font-semibold text-white/80">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>
            Secure business workspace
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#087DBB]">{mode === "login" ? "Welcome back" : "Get started"}</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#17263B]">{mode === "login" ? "Sign in to Cenexa" : "Create your account"}</h2>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">{mode === "login" ? "Manage your WhatsApp conversations and assistant." : "Set up your workspace and connect WhatsApp."}</p>

            <form action={handleSubmit} className="mt-9 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#475569]">Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@business.com" className="h-13 w-full rounded-xl border border-[#B9DDF2] bg-[#F2F9FD] px-4 text-sm text-[#17263B] placeholder:text-[#94A3B8] focus:border-[#078BCB] focus:outline-none focus:ring-4 focus:ring-[#078BCB]/10" />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#475569]">Password</label>
                <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} placeholder="Enter your password" className="h-13 w-full rounded-xl border border-[#B9DDF2] bg-[#F2F9FD] px-4 text-sm text-[#17263B] placeholder:text-[#94A3B8] focus:border-[#078BCB] focus:outline-none focus:ring-4 focus:ring-[#078BCB]/10" />
              </div>
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={isPending} className="mt-3 h-13 w-full rounded-xl bg-[#078BCB] font-bold text-white shadow-[0_8px_18px_rgba(7,139,203,0.2)] transition hover:bg-[#0876AE] disabled:cursor-not-allowed disabled:opacity-60">
                {isPending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
            <p className="mt-7 text-center text-sm text-[#64748B]">
              {mode === "login" ? "New to Cenexa? " : "Already have an account? "}
              <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }} className="font-bold text-[#087DBB] hover:text-[#075D91]">
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
