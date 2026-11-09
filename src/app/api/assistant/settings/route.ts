import { NextRequest } from "next/server";
import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";

const FIELDS = "system_prompt, welcome_message, handoff_rules, handoff_keywords, greeting_phrases, url_rewrite_from, url_rewrite_to";

function normalizeStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== "string")) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const { businessId, admin } = access;
  const { data, error } = await admin.from("businesses").select(FIELDS).eq("id", businessId).maybeSingle();
  if (error) return Response.json({ error: "Unable to load assistant settings" }, { status: 500 });
  if (!data) return Response.json({ error: "Business not found" }, { status: 404 });
  return Response.json({ settings: data });
}

export async function PATCH(request: NextRequest) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "assistant_settings");
  if (denied) return denied;
  const { businessId, admin } = access;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const key of ["system_prompt", "welcome_message", "handoff_rules"] as const) {
    if (!(key in body)) continue;
    const value = body[key];
    const maxLength = key === "system_prompt" ? 12_000 : key === "handoff_rules" ? 4_000 : 1_000;
    if (value !== null && (typeof value !== "string" || value.length > maxLength)) {
      return Response.json({ error: `${key} is too long or invalid` }, { status: 400 });
    }
    update[key] = typeof value === "string" && !value.trim() ? null : value;
  }

  for (const key of ["handoff_keywords", "greeting_phrases"] as const) {
    if (!(key in body)) continue;
    const values = normalizeStringList(body[key]);
    if (!values || values.some((value) => value.length > 80)) {
      return Response.json({ error: `${key} must be a list of up to 50 short phrases` }, { status: 400 });
    }
    update[key] = values;
  }

  for (const key of ["url_rewrite_from", "url_rewrite_to"] as const) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value !== null && (typeof value !== "string" || value.length > 500)) {
      return Response.json({ error: `${key} is invalid` }, { status: 400 });
    }
    update[key] = typeof value === "string" && !value.trim() ? null : value;
  }
  if (!Object.keys(update).length) return Response.json({ error: "No valid settings provided" }, { status: 400 });

  const hasRewriteFrom = "url_rewrite_from" in update;
  const hasRewriteTo = "url_rewrite_to" in update;
  if (hasRewriteFrom !== hasRewriteTo) {
    return Response.json({ error: "Set both URL rewrite values together" }, { status: 400 });
  }
  if (hasRewriteFrom && Boolean(update.url_rewrite_from) !== Boolean(update.url_rewrite_to)) {
    return Response.json({ error: "Both URL rewrite values must be set or cleared together" }, { status: 400 });
  }
  if (update.url_rewrite_from && update.url_rewrite_to) {
    try {
      new URL(update.url_rewrite_from as string);
      new URL(update.url_rewrite_to as string);
    } catch {
      return Response.json({ error: "URL rewrite values must be absolute URLs" }, { status: 400 });
    }
  }

  const { data, error } = await admin
    .from("businesses")
    .update(update)
    .eq("id", businessId)
    .select(FIELDS)
    .maybeSingle();
  if (error) return Response.json({ error: "Unable to save assistant settings" }, { status: 500 });
  if (!data) return Response.json({ error: "Business not found" }, { status: 404 });
  return Response.json({ settings: data });
}
