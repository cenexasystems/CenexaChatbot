"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Step = "details" | "connect" | "processing" | "success" | "error";
type OnboardingType = "api" | "coexistence";

declare global {
  interface Window {
    FB: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/* ─── SVG Icons ──────────────────────────────────────────────────────────── */
function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function MetaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.195 0 11.755 0 14.058c0 .442.025.888.086 1.32C.583 18.698 2.498 21 4.925 21c.846 0 1.637-.218 2.375-.813C8.017 19.608 8.703 19 10.726 19c2.024 0 2.71.608 3.426 1.187.74.595 1.53.813 2.376.813 2.426 0 4.34-2.302 4.838-5.622.06-.43.086-.876.086-1.319 0-2.303-.704-4.863-2.044-6.915-1.188-1.832-2.903-3.113-4.87-3.113-1.05 0-1.885.301-2.595.819C11.188 5.243 10.52 5.5 10 5.5c-.52 0-1.188-.257-1.943-.793-.71-.518-1.545-.677-2.595-.677h.453zm0 1.5h.453c.73 0 1.334.17 1.803.497.538.37 1.148.673 1.829.673.68 0 1.29-.302 1.829-.673.469-.328 1.073-.497 1.803-.497 1.388 0 2.698 1.01 3.655 2.497C19.374 9.627 20 11.857 20 14.058c0 .388-.02.78-.073 1.162-.4 2.726-1.85 4.28-3.598 4.28-.445 0-.895-.124-1.348-.484-.836-.675-1.73-1.516-4.255-1.516-2.526 0-3.42.841-4.256 1.516-.453.36-.903.484-1.348.484-1.748 0-3.197-1.554-3.597-4.28A9.055 9.055 0 012 14.058c0-2.2.626-4.432 1.76-6.031.957-1.487 2.267-2.497 3.655-2.497h-.5z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Step indicator ────────────────────────────────────────────────────── */
function StepDots({ current }: { current: Step }) {
  const steps: Step[] = ["details", "connect", "processing", "success"];
  const idx = steps.indexOf(current);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            i < idx
              ? "bg-emerald-500 w-6"
              : i === idx
              ? "bg-emerald-400 w-8"
              : "bg-white/10 w-4"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function OnboardPage() {
  const router = useRouter();
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;

  const [step, setStep] = useState<Step>("details");
  const [businessName, setBusinessName] = useState("");
  const [onboardingType, setOnboardingType] = useState<OnboardingType | null>(null);
  const [registrationPin, setRegistrationPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [successData, setSuccessData] = useState<{
    phoneNumberId: string;
    whatsappNumber: string | null;
  } | null>(null);
  const visibleStep: Step = appId ? step : "error";
  const visibleError = appId ? errorMsg : "Meta onboarding is not configured for this deployment. Please contact the Cenexa administrator.";

  /* ── Load Facebook SDK ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!appId) return;

    // Inject FB async init
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v19.0",
      });
      setSdkReady(true);
    };

    // Load SDK script
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else {
      // Script already loaded (hot reload etc.)
      window.setTimeout(() => setSdkReady(Boolean(window.FB)), 0);
    }
  }, [appId]);

  /* ── Check if already onboarded ───────────────────────────────────────── */
  useEffect(() => {
    fetch("/api/onboard/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.hasBusiness) {
          router.replace("/");
        }
      })
      .catch(() => {});
  }, [router]);

  /* ── Launch FB Embedded Signup popup ──────────────────────────────────── */
  const launchSignup = useCallback(() => {
    if (!sdkReady || !window.FB) {
      setErrorMsg("Facebook SDK is still loading. Please wait a moment and try again.");
      return;
    }

    const configId = process.env.NEXT_PUBLIC_FB_CONFIG_ID;
    if (!configId) {
      setStep("error");
      setErrorMsg(
        "NEXT_PUBLIC_FB_CONFIG_ID is not set. Please add it to your .env.local file."
      );
      return;
    }
    if (!onboardingType) {
      setErrorMsg("Choose API number or WhatsApp Business app first.");
      return;
    }
    if (onboardingType === "api" && !/^\d{6}$/.test(registrationPin)) {
      setStep("details");
      setErrorMsg("Enter the number owner's six-digit WhatsApp PIN for API setup.");
      return;
    }

    setStep("processing");
    setErrorMsg("");

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setStep("error");
          setErrorMsg(
            "Facebook signup was cancelled or failed. Please try again."
          );
          return;
        }

        // Meta SDK doesn't allow async callbacks, so we use an async IIFE
        (async () => {
          try {
            const res = await fetch("/api/onboard/callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code,
                businessName,
                onboardingType,
                ...(onboardingType === "api" ? { registrationPin } : {}),
              }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
              setStep("error");
              setErrorMsg(data.error ?? "Something went wrong. Please try again.");
              return;
            }

            setSuccessData({
              phoneNumberId: data.phoneNumberId,
              whatsappNumber: data.whatsappNumber,
            });
            setStep("success");
          } catch {
            setStep("error");
            setErrorMsg("Network error while saving credentials. Please try again.");
          }
        })();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          ...(onboardingType === "coexistence" ? { featureType: "whatsapp_business_app_onboarding" } : {}),
          sessionInfoVersion: onboardingType === "coexistence" ? "3" : "2",
        },
      }
    );
  }, [sdkReady, businessName, registrationPin, onboardingType]);

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="cx-onboard min-h-screen bg-[#EFF7FC] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(7,139,203,0.12) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 w-[600px] h-[400px] opacity-20"
        style={{
          background:
            "radial-gradient(ellipse at bottom left, rgba(7,139,203,0.10) 0%, transparent 70%)",
        }}
      />

      {/* Logo / brand top-left */}
      <div className="fixed top-6 left-8 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <span className="text-white/80 font-semibold text-sm tracking-tight">Cenexa</span>
      </div>

      {/* Logout button top-right */}
      <div className="fixed top-6 right-8">
        <button
          onClick={async () => {
            const { logout } = await import("@/app/login/actions");
            logout();
          }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-white/60 hover:text-white transition-colors"
        >
          Log Out
        </button>
      </div>

      {/* Main card */}
      <div className="w-full max-w-lg relative z-10">
        {/* Step indicator */}
        {visibleStep !== "error" && (
          <div className="flex justify-center mb-8">
            <StepDots current={visibleStep} />
          </div>
        )}

        {/* ── STEP 1: Business Details ───────────────────────────────────── */}
        {visibleStep === "details" && (
          <div className="bg-[#111111] border border-white/[0.07] rounded-3xl p-8 shadow-2xl shadow-black/60 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400">
                <WhatsAppIcon />
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight mb-2">
                Set up your WhatsApp bot
              </h1>
              <p className="text-white/50 text-sm leading-relaxed">
                Connect your WhatsApp Business number in under 5 minutes. Your clients
                experience zero change — this only affects how you onboard.
              </p>
            </div>

            {/* What you'll need callout */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-6 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-3">
                What you&apos;ll need
              </p>
              {[
                "A Facebook account (personal or business)",
                "A new API number, or an existing WhatsApp Business app number for Coexistence",
                "Access to the number to complete Meta's verification or linking steps",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-sm text-white/60 leading-snug">{item}</span>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                  Business Name
                </label>
                <input
                  id="business-name-input"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && businessName.trim() && onboardingType && (onboardingType === "coexistence" || /^\d{6}$/.test(registrationPin))) setStep("connect");
                  }}
                  placeholder="e.g. Sharma Electronics"
                  className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-emerald-500/60 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none transition-all text-sm"
                  autoFocus
                />
              </div>

              <fieldset>
                <legend className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">How is this number used?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={onboardingType === "api"}
                    onClick={() => { setOnboardingType("api"); setErrorMsg(""); }}
                    className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5BD3] ${onboardingType === "api" ? "border-[#0B5BD3] bg-[#E8F1FD] shadow-[0_0_0_2px_rgba(11,91,211,0.15)]" : "border-[#C9D3E1] bg-white hover:border-[#0B5BD3] hover:bg-[#F7FAFF]"}`}
                  >
                    <span className={`block text-sm font-semibold ${onboardingType === "api" ? "text-[#0B3B8C]" : "text-[#17263B]"}`}>WhatsApp Cloud API</span>
                    <span className="block mt-1 text-xs leading-relaxed text-[#53627A]">Connect this number directly to Cloud API. It will not keep running in the WhatsApp Business app.</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={onboardingType === "coexistence"}
                    onClick={() => { setOnboardingType("coexistence"); setRegistrationPin(""); setErrorMsg(""); }}
                    className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5BD3] ${onboardingType === "coexistence" ? "border-[#0B5BD3] bg-[#E8F1FD] shadow-[0_0_0_2px_rgba(11,91,211,0.15)]" : "border-[#C9D3E1] bg-white hover:border-[#0B5BD3] hover:bg-[#F7FAFF]"}`}
                  >
                    <span className={`block text-sm font-semibold ${onboardingType === "coexistence" ? "text-[#0B3B8C]" : "text-[#17263B]"}`}>Keep using the Business app</span>
                    <span className="block mt-1 text-xs leading-relaxed text-[#53627A]">Keep using the number in the WhatsApp Business app while connecting it to ChatFlow.</span>
                  </button>
                </div>
              </fieldset>

              {onboardingType === "api" && (
                <div>
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    WhatsApp two-step PIN <span className="normal-case">(API setup)</span>
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={registrationPin}
                    onChange={(e) => { setRegistrationPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setErrorMsg(""); }}
                    placeholder="Enter the number owner's 6-digit PIN"
                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-emerald-500/60 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none transition-all text-sm"
                  />
                  <p className="text-xs text-white/40 mt-2">The owner chooses a six-digit two-step PIN for this API number, or enters its existing PIN if one is already set. It is sent to Meta during setup and not saved.</p>
                </div>
              )}

              {onboardingType === "coexistence" && (
                <p className="text-xs text-white/50">No PIN is needed here. The owner must approve the connection from their WhatsApp Business app during Meta&apos;s setup.</p>
              )}

              {errorMsg && step === "details" && <p role="alert" className="text-xs text-red-300">{errorMsg}</p>}

              <button
                id="next-step-btn"
                onClick={() => {
                  if (!businessName.trim() || !onboardingType || (onboardingType === "api" && !/^\d{6}$/.test(registrationPin))) return;
                  setStep("connect");
                }}
                disabled={!businessName.trim() || !onboardingType || (onboardingType === "api" && !/^\d{6}$/.test(registrationPin))}
                className="w-full bg-[#0B5BD3] hover:bg-[#0A4CB3] disabled:bg-[#D9E6F5] disabled:text-[#53627A] disabled:shadow-none disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 text-sm shadow-lg shadow-[#0B5BD3]/20 hover:shadow-[#0B5BD3]/30 active:scale-[0.98]"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Connect ────────────────────────────────────────────── */}
        {visibleStep === "connect" && (
          <div className="bg-[#111111] border border-white/[0.07] rounded-3xl p-8 shadow-2xl shadow-black/60 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#1877F2]/10 border border-[#1877F2]/20 flex items-center justify-center mb-5 text-[#1877F2]">
                <MetaIcon />
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight mb-2">
                Connect via Facebook
              </h1>
              <p className="text-white/50 text-sm leading-relaxed">
                A secure Facebook popup will open. Log in, select your Business Portfolio,
                then follow the {onboardingType === "coexistence" ? "existing WhatsApp Business app linking" : "new API number and OTP"} steps in Meta.
              </p>
            </div>

            {/* Business name summary */}
            <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-white/30 uppercase tracking-wider">Business Name</p>
                <p className="text-sm font-medium text-white truncate">{businessName}</p>
                <p className="text-[10px] text-emerald-300 mt-0.5">{onboardingType === "coexistence" ? "Existing WhatsApp Business app · Coexistence" : "WhatsApp Cloud API (not Business app)"}</p>
              </div>
              <button
                onClick={() => setStep("details")}
                className="ml-auto text-xs text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
              >
                Edit
              </button>
            </div>

            {/* Step-by-step preview */}
            <div className="space-y-2.5 mb-8">
              {[
                { n: "1", label: "Log in with Facebook" },
                { n: "2", label: "Select or create Business Portfolio" },
                { n: "3", label: onboardingType === "coexistence" ? "Select the number already used in WhatsApp Business app and approve linking" : "Add a Cloud API number and verify it by OTP" },
                { n: "4", label: onboardingType === "coexistence" ? "Keep using the Business app alongside ChatFlow" : "Finish API registration; the bot connects" },
              ].map((item) => (
                <div key={item.n} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-semibold text-white/40">{item.n}</span>
                  </div>
                  <span className="text-sm text-white/60">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {/* Main CTA */}
              <button
                id="connect-whatsapp-btn"
                onClick={launchSignup}
                disabled={!sdkReady}
                className="w-full relative group overflow-hidden rounded-xl py-4 font-semibold text-sm transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #1877F2 0%, #0a5fd6 100%)",
                  boxShadow: "0 8px 32px rgba(24,119,242,0.35)",
                }}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative flex items-center justify-center gap-2.5 text-white">
                  <MetaIcon />
                  {sdkReady ? "Connect WhatsApp Business" : "Loading Facebook SDK…"}
                </span>
              </button>

              <button
                onClick={() => setStep("details")}
                className="w-full py-3 text-sm text-white/30 hover:text-white/60 transition-colors"
              >
                ← Go back
              </button>
            </div>

            {/* App Review warning */}
            <div className="mt-6 p-3 bg-amber-500/[0.06] border border-amber-500/15 rounded-xl">
              <p className="text-[11px] text-amber-400/70 leading-relaxed">
                <span className="font-semibold text-amber-400">Testing mode:</span> Until Meta
                App Review is approved, only Facebook accounts added as test users can use this
                flow. Add your account in the Meta developer dashboard first.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Processing ─────────────────────────────────────────── */}
        {visibleStep === "processing" && (
          <div className="bg-[#111111] border border-white/[0.07] rounded-3xl p-8 shadow-2xl shadow-black/60 animate-in fade-in duration-300 text-center">
            <div className="flex flex-col items-center gap-6 py-6">
              {/* Animated spinner ring */}
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-2 border-white/5" />
                <div
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin"
                  style={{ animationDuration: "0.8s" }}
                />
                <div className="absolute inset-3 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <WhatsAppIcon />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Setting up your bot…</h2>
                <p className="text-sm text-white/40 leading-relaxed max-w-xs mx-auto">
                  Exchanging credentials with Meta and configuring your WhatsApp Business Account.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {[
                  "Verifying authorization",
                  "Fetching WABA credentials",
                  "Registering phone number",
                  "Saving to database",
                ].map((label) => (
                  <div key={label} className="flex items-center gap-2.5 text-left">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse flex-shrink-0" />
                    <span className="text-xs text-white/40">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Success ────────────────────────────────────────────── */}
        {visibleStep === "success" && (
          <div className="bg-[#111111] border border-white/[0.07] rounded-3xl p-8 shadow-2xl shadow-black/60 animate-in fade-in zoom-in-95 duration-500 text-center">
            <div className="flex flex-col items-center gap-5 py-4">
              {/* Success icon */}
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-emerald-400"
                style={{
                  background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
                  boxShadow: "0 0 40px rgba(16,185,129,0.2)",
                }}
              >
                <CheckCircleIcon />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  🎉 Bot is live!
                </h2>
                <p className="text-sm text-white/50 leading-relaxed">
                  <span className="text-white font-medium">{businessName}</span> is now connected.
                  Your WhatsApp bot is active and ready to handle customer messages.
                </p>
              </div>

              {successData?.whatsappNumber && (
                <div className="bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl px-5 py-3 w-full">
                  <p className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-1">
                    Connected Number
                  </p>
                  <p className="text-lg font-semibold text-emerald-400 tracking-wide">
                    {successData.whatsappNumber}
                  </p>
                </div>
              )}

              <div className="w-full space-y-2.5 text-left mt-2">
                {[
                  "Customers can WhatsApp this number immediately",
                  "AI agent is handling conversations automatically",
                  "Manage chats from your dashboard",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-sm text-white/60">{item}</span>
                  </div>
                ))}
              </div>

              <button
                id="go-to-dashboard-btn"
                onClick={() => router.push("/")}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 text-sm shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.98] mt-2"
              >
                Go to Dashboard →
              </button>
            </div>
          </div>
        )}

        {/* ── ERROR State ───────────────────────────────────────────────── */}
        {visibleStep === "error" && (
          <div className="bg-[#111111] border border-red-500/20 rounded-3xl p-8 shadow-2xl shadow-black/60 animate-in fade-in duration-300 text-center">
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
                <p className="text-sm text-red-400/80 leading-relaxed">{visibleError}</p>
              </div>

              {/* Common errors helper */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-left w-full space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-2">
                  Common fixes
                </p>
                {[
                  "Make sure you are added as a test user in the Meta developer dashboard",
                  "Ensure NEXT_PUBLIC_FB_CONFIG_ID and META_APP_SECRET are set in .env.local",
                  "Your Vercel/localhost domain must be whitelisted in Meta app settings",
                ].map((tip) => (
                  <div key={tip} className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0 mt-1.5" />
                    <span className="text-xs text-white/40">{tip}</span>
                  </div>
                ))}
              </div>

              {appId && <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setStep("connect"); setErrorMsg(""); }}
                  className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white font-medium py-3 rounded-xl transition-all text-sm"
                >
                  ← Try Again
                </button>
                <button
                  id="retry-connect-btn"
                  onClick={launchSignup}
                  disabled={!sdkReady}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-white font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  Retry Popup
                </button>
              </div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
