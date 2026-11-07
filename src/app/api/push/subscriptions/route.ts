import { NextRequest } from "next/server";
import { requireBusinessAccess } from "@/lib/api-auth";
import { reactivateOwnerAlerts } from "@/lib/owner-alerts";

type BrowserSubscription = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function validSubscription(input: BrowserSubscription): input is BrowserSubscription & {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  if (typeof input.endpoint !== "string" || typeof input.keys?.p256dh !== "string" || typeof input.keys?.auth !== "string") return false;
  try {
    if (new URL(input.endpoint).protocol !== "https:") return false;
  } catch {
    return false;
  }
  return input.keys.p256dh.length >= 20 && input.keys.auth.length >= 8;
}

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, userId, admin } = access;
  const { count, error } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("user_id", userId);
  if (error) return Response.json({ error: "Unable to load push status" }, { status: 500 });
  return Response.json({
    subscribed: (count ?? 0) > 0,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export async function POST(request: NextRequest) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, userId, admin } = access;
  let subscription: BrowserSubscription;
  try {
    subscription = await request.json();
  } catch {
    return Response.json({ error: "Invalid subscription body" }, { status: 400 });
  }
  if (!validSubscription(subscription)) return Response.json({ error: "Invalid push subscription" }, { status: 400 });
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return Response.json({ error: "Web Push is not configured" }, { status: 503 });
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    { business_id: businessId, user_id: userId, endpoint: subscription.endpoint, subscription },
    { onConflict: "business_id,user_id,endpoint" }
  );
  if (error) return Response.json({ error: "Unable to save push subscription" }, { status: 500 });
  await reactivateOwnerAlerts(businessId);
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, userId, admin } = access;
  let endpoint: unknown;
  try {
    endpoint = (await request.json()).endpoint;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof endpoint !== "string") return Response.json({ error: "Subscription endpoint is required" }, { status: 400 });

  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (error) return Response.json({ error: "Unable to remove push subscription" }, { status: 500 });
  return Response.json({ success: true });
}
