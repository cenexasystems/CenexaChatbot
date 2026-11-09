import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { requireModuleEnabled } from "@/lib/module-access";

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess(); if (response) return response;
  const denied = requirePermission(access, "automation_manage"); if (denied) return denied;
  const disabled = await requireModuleEnabled(access.admin, access.businessId, "automations"); if (disabled) return disabled;
  const body = await request.json().catch(() => ({}));
  if (typeof body.contactId !== "string" || typeof body.runAt !== "string" || !Number.isFinite(Date.parse(body.runAt))) return Response.json({ error: "Contact and reminder date are required" }, { status: 400 });
  const { data: contact } = await access.admin.from("contacts").select("id,conversation_id,opt_in_at,opt_out_at").eq("id", body.contactId).eq("business_id", access.businessId).maybeSingle();
  if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 });
  if (!contact.opt_in_at || contact.opt_out_at) return Response.json({ error: "Reminder requires an opted-in contact" }, { status: 409 });
  const { data: automation } = await access.admin.from("automations").select("id,enabled").eq("business_id", access.businessId).eq("rule_type", "dated_reminder").maybeSingle();
  if (!automation?.enabled) return Response.json({ error: "Enable the dated reminder rule first" }, { status: 409 });
  const key = `dated:${contact.id}:${Date.parse(body.runAt)}`;
  const { data, error } = await access.admin.from("automation_runs").insert({ business_id: access.businessId, automation_id: automation.id, contact_id: contact.id, conversation_id: contact.conversation_id, trigger_event_key: key, run_at: new Date(body.runAt).toISOString() }).select("id,run_at,status").single();
  if (error?.code === "23505") return Response.json({ error: "This reminder already exists" }, { status: 409 });
  if (error) return Response.json({ error: "Could not schedule reminder" }, { status: 500 });
  return Response.json({ run: data }, { status: 201 });
}
