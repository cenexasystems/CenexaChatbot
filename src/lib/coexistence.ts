import { GRAPH_BASE } from "@/lib/graph";

/**
 * WhatsApp Business app + Cloud API Coexistence helpers.
 * Docs: developers.facebook.com → WhatsApp → Embedded Signup → "Onboard WhatsApp Business app users"
 */

type GraphResult = { ok: boolean; status: number; data: Record<string, unknown> };

async function graph(path: string, accessToken: string, init: RequestInit = {}): Promise<GraphResult> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && !data.error, status: res.status, data };
}

/** Subscribe our app to the customer's WABA so message webhooks flow to us. Idempotent. */
export async function subscribeAppToWaba(wabaId: string, accessToken: string) {
  return graph(`/${wabaId}/subscribed_apps`, accessToken, { method: "POST" });
}

/**
 * Is this number live on BOTH the Business app and Cloud API?
 * Meta: is_on_biz_app === true && platform_type === "CLOUD_API"
 */
export async function getPhoneCoexistenceStatus(phoneNumberId: string, accessToken: string) {
  const r = await graph(`/${phoneNumberId}?fields=is_on_biz_app,platform_type`, accessToken);
  return {
    ok: r.ok,
    isOnBizApp: r.data.is_on_biz_app === true,
    platformType: (r.data.platform_type as string | undefined) ?? null,
  };
}

/**
 * Kick off the one-time contact + chat-history sync.
 * Meta gives 24h after onboarding to do this, and each can only be requested ONCE
 * per onboarding — so callers must guard with businesses.coexistence_synced_at.
 */
export async function startCoexistenceSync(phoneNumberId: string, accessToken: string) {
  const out: Record<string, { ok: boolean; requestId?: string; error?: string }> = {};
  for (const syncType of ["smb_app_state_sync", "history"] as const) {
    const r = await graph(`/${phoneNumberId}/smb_app_data`, accessToken, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
    });
    const errorObj = r.data?.error as { message?: string } | undefined;
    out[syncType] = r.ok
      ? { ok: true, requestId: r.data.request_id as string | undefined }
      : { ok: false, error: errorObj?.message ?? `HTTP ${r.status}` };
  }
  return out;
}
