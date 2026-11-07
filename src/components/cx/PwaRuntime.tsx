"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __cenexaInstallPrompt?: Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    } | null;
  }
}

export function PwaRuntime() {
  useEffect(() => {
    const rememberInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.__cenexaInstallPrompt = event as NonNullable<Window["__cenexaInstallPrompt"]>;
      window.dispatchEvent(new Event("cenexa-install-prompt"));
    };
    window.addEventListener("beforeinstallprompt", rememberInstallPrompt);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error: unknown) => {
        console.error("Could not register the Cenexa service worker", error);
      });
    }
    return () => window.removeEventListener("beforeinstallprompt", rememberInstallPrompt);
  }, []);

  return null;
}
