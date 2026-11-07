"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, Status } from "@/components/cx/ui";

type Connection = {
  name: string;
  phoneNumber: string | null;
  active: boolean;
  onboardingType: "api" | "coexistence";
  coexistenceEnabled: boolean;
  syncedAt: string | null;
  disconnectedReason: string | null;
  phoneLinked: boolean;
  aiPaused: boolean;
};

const demoConnection: Connection = {
  name: "Demo business",
  phoneNumber: "+91 98765 43210",
  active: true,
  onboardingType: "coexistence",
  coexistenceEnabled: true,
  syncedAt: null,
  disconnectedReason: null,
  phoneLinked: true,
  aiPaused: false,
};

export function WhatsAppConnection({ demo }: { demo: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(demo ? demoConnection : null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    if (demo) return;
    try {
      const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to check the connection.");
      setConnection(body.connection as Connection);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check the connection.");
    }
  }, [demo]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = window.setInterval(() => void load(), 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [load]);

  const state = getState(connection, now);
  const hoursLeft = connection?.syncedAt ? Math.max(0, 24 * 60 * 60 * 1000 - (now - Date.parse(connection.syncedAt))) : 0;
  const countdown = `${Math.floor(hoursLeft / 3_600_000)}h ${Math.floor((hoursLeft % 3_600_000) / 60_000)}m`;

  return (
    <div id="whatsapp-connection">
      <Panel title="WhatsApp connection" icon="wifi" action={state ? <Status tone={state.tone}>{state.label}</Status> : undefined}>
        <div className="p-4 space-y-4">
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {connection ? (
            <>
              <div>
                <p className="text-[13px] font-semibold">{connection.name}</p>
                <p className="text-[12px] text-ink-faint">{connection.phoneNumber || "Phone number not available"}</p>
              </div>
              {connection.disconnectedReason && (
                <p className="rounded-lg bg-danger-tint px-3 py-2 text-[12px] text-danger">Needs attention: {connection.disconnectedReason}</p>
              )}
              {state?.key === "syncing" && <p className="text-[12px] text-ink-soft">Contact and chat history sync window: {countdown} remaining.</p>}
              {connection.aiPaused && <p className="text-[12px] font-semibold text-attention">AI paused for one or more conversations. Review the Needs you queue.</p>}
              <ol className="grid sm:grid-cols-2 gap-2 text-[12px]">
                <Check done={Boolean(connection.phoneNumber)} label="WhatsApp number connected" />
                <Check done={connection.onboardingType === "coexistence" && connection.coexistenceEnabled && connection.phoneLinked} label="Business app linked to Cenexa" />
                <Check done={Boolean(connection.syncedAt)} label="Contact and chat history sync started" />
                <Check done={connection.active && !connection.disconnectedReason} label="Webhook connection active" />
              </ol>
              {!demo && <button type="button" onClick={() => void load()} className="text-[12px] font-semibold text-accent hover:underline">Refresh status</button>}
            </>
          ) : (
            <p className="text-[13px] text-ink-faint">Loading WhatsApp connection…</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function getState(connection: Connection | null, now: number) {
  if (!connection) return null;
  if (connection.disconnectedReason) return { key: "attention", label: "Needs attention", tone: "danger" as const };
  if (!connection.active) return { key: "disconnected", label: "Disconnected", tone: "danger" as const };
  if (connection.onboardingType !== "coexistence" || !connection.coexistenceEnabled || !connection.phoneNumber || !connection.phoneLinked) return { key: "connecting", label: "Connecting", tone: "attention" as const };
  if (connection.syncedAt && now - Date.parse(connection.syncedAt) < 24 * 60 * 60 * 1000) {
    return { key: "syncing", label: "Syncing", tone: "attention" as const };
  }
  if (connection.aiPaused) return { key: "paused", label: "AI paused", tone: "attention" as const };
  return { key: "live", label: "Live", tone: "success" as const };
}

function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
      <span aria-hidden="true" className={done ? "text-success" : "text-ink-faint"}>{done ? "✓" : "○"}</span>
      <span>{label}</span>
    </li>
  );
}
