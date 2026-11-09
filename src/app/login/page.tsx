"use client";

import { useState } from "react";
import Image from "next/image";
import { login, signup } from "./actions";

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.7">
      <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
      {crossed && <path d="m4 4 16 16" strokeLinecap="round" />}
    </svg>
  );
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(null);
    try {
      const result = await (mode === "login" ? login : signup)(formData);
      if (result?.error) setError(result.error);
    } catch (err) {
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
      setError("We could not sign you in. Please check your details and try again.");
    } finally {
      setIsPending(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFF7FC] px-5 py-10 text-[#17263B]">
      <div className="w-full max-w-[420px]">
        <section className="relative overflow-hidden rounded-[24px] border border-[#B9E2F5] bg-white px-7 pb-7 pt-8 shadow-[0_24px_70px_rgba(15,75,120,0.14)] sm:px-9 sm:pb-8 sm:pt-9">
          <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-[#0B3B8C] via-[#078BCB] to-[#19B4EC]" />

          <div className="flex flex-col items-center text-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[19px] border border-[#C9E5F6] bg-[#F2F9FD] p-3 shadow-[0_8px_24px_rgba(15,75,120,0.14)]">
              <Image src="/brand/cenexa-mark.png" alt="Cenexa" width={52} height={52} className="h-full w-full object-contain" priority />
            </div>
            <p className="mt-4 font-[var(--font-wordmark)] text-[23px] leading-none tracking-[0.03em] text-[#0A1F44]">CENEXA</p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[#078BCB]">CHATFLOW</p>
          </div>

          <div className="mt-8 text-center">
            <h1 className="text-[21px] font-extrabold tracking-[0.01em] text-[#17263B]">
              {isLogin ? "Welcome back" : "Create your account"}
            </h1>
              <p className="mt-2 text-sm leading-6 text-[#53627A]">
              {isLogin ? "Sign in to manage your WhatsApp workspace." : "Create an account to set up your WhatsApp workspace."}
            </p>
          </div>

          <form action={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block pl-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#39485F]">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@business.com"
                className="h-[50px] w-full rounded-[13px] border border-[#B9DDF2] bg-[#F2F9FD] px-4 text-sm font-medium text-[#17263B] placeholder:text-[#7B8CA3] outline-none transition focus:border-[#078BCB] focus:ring-2 focus:ring-[#078BCB]/15"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block pl-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#39485F]">
                Password
              </label>
              <div className="flex h-[50px] items-center rounded-[13px] border border-[#B9DDF2] bg-[#F2F9FD] px-3.5 transition focus-within:border-[#078BCB] focus-within:ring-2 focus-within:ring-[#078BCB]/15">
                <span className="mr-3 text-[#0B5BD3]"><LockIcon /></span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  placeholder="Enter your password"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-[#17263B] placeholder:text-[#7B8CA3] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="ml-2 flex h-8 w-8 items-center justify-center rounded-md text-[#71839A] transition hover:bg-[#E5F2FA] hover:text-[#0B3B8C]"
                >
                  <EyeIcon crossed={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-[#efc9c9] bg-[#fff5f5] px-4 py-3 text-sm font-medium text-[#a32929]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 flex h-[50px] w-full items-center justify-center gap-2 rounded-[13px] bg-gradient-to-r from-[#0B3B8C] via-[#087DBB] to-[#078BCB] text-xs font-extrabold uppercase tracking-[0.16em] text-white shadow-[0_10px_18px_rgba(7,91,164,0.24)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#078BCB]/25 disabled:cursor-wait disabled:opacity-60"
            >
              {isPending ? "Please wait…" : isLogin ? "Authenticate" : "Create account"}
              {!isPending && isLogin && <span aria-hidden="true" className="text-base leading-none">›</span>}
            </button>
          </form>

          <div className="mt-5 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C9D9E9] bg-[#F2F7FC] px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#39485F]">
              <span className="h-2 w-2 rounded-full bg-[#078BCB]" />
              Secure business sign-in
            </span>
          </div>

          <p className="mt-5 text-center text-xs text-[#53627A]">
            {isLogin ? "New to Cenexa? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => { setMode(isLogin ? "signup" : "login"); setError(null); }}
              className="font-bold text-[#075D91] underline decoration-[#89B9D8] underline-offset-2 hover:text-[#0B3B8C] hover:decoration-[#0B3B8C]"
            >
              {isLogin ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>

        <p className="mt-5 text-center text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#71839A]">
          Cenexa ChatFlow · Business workspace
        </p>
      </div>
    </main>
  );
}
