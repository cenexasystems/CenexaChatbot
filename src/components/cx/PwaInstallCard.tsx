"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Panel, Button } from "@/components/cx/ui";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __cenexaInstallPrompt?: InstallPromptEvent | null;
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function subscribeToDeviceMode(onChange: () => void) {
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  mediaQuery.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    mediaQuery.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

function subscribeToNothing() {
  return () => {};
}

function getServerSnapshot() {
  return false;
}

export function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const installed = useSyncExternalStore(subscribeToDeviceMode, isStandalone, getServerSnapshot);
  const appleMobile = useSyncExternalStore(subscribeToNothing, isAppleMobile, getServerSnapshot);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onInstallPromptReady = () => {
      if (window.__cenexaInstallPrompt) setInstallPrompt(window.__cenexaInstallPrompt);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setMessage("Cenexa is installed on this device.");
    };

    onInstallPromptReady();
    window.addEventListener("cenexa-install-prompt", onInstallPromptReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("cenexa-install-prompt", onInstallPromptReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    setInstallPrompt(null);
    window.__cenexaInstallPrompt = null;
    setMessage(result.outcome === "accepted" ? "Cenexa is being installed." : "You can install Cenexa later from your browser menu.");
  }

  return (
    <Panel title="Install Cenexa" icon="phone">
      <div className="p-4 space-y-3">
        <p className="text-[13px] text-ink-soft">
          Add ChatFlow to your phone home screen for a full-screen app. Enable alerts from this phone in the Owner alerts section below.
        </p>
        {installed ? (
          <p className="text-[12px] font-semibold text-emerald-700">Cenexa is installed on this device.</p>
        ) : installPrompt ? (
          <Button variant="primary" onClick={install}>Install app</Button>
        ) : appleMobile ? (
          <p className="text-[12px] text-ink-faint">In Safari, tap Share, then choose “Add to Home Screen.” Open Cenexa from the new home screen icon before enabling phone notifications.</p>
        ) : (
          <p className="text-[12px] text-ink-faint">Use your browser menu and choose “Install app” or “Add to Home screen.”</p>
        )}
        {message && <p role="status" className="text-[12px] text-ink-faint">{message}</p>}
      </div>
    </Panel>
  );
}
