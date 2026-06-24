"use client";

import { useState } from "react";
import { login, signup } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(null);
    
    try {
      const action = mode === "login" ? login : signup;
      const result = await action(formData);
      
      if (result?.error) {
        setError(result.error);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes("NEXT_REDIRECT")) {
        throw err;
      }
      setError("An unexpected error occurred during login. Check server logs.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0E0E0E] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161616] rounded-2xl border border-white/5 p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-emerald-500">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-sm text-white/50 mt-2">
            {mode === "login" ? "Sign in to manage your WhatsApp bot" : "Sign up to create your multi-tenant workspace"}
          </p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/60 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full bg-[#0E0E0E] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all"
              placeholder="hello@cenexa.systems"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full bg-[#0E0E0E] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {isPending ? "Please wait..." : mode === "login" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <div className="mt-8 text-center text-sm">
          <span className="text-white/40">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
            }}
            className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
