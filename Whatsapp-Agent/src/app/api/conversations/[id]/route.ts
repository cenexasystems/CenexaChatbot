import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const allowed = ["mode", "assigned_to", "tags", "payment_status", "internal_note"];
  const update: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (body.mode && !["agent", "human"].includes(body.mode)) {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }

  if (
    body.payment_status &&
    !["none", "pending", "verified", "rejected"].includes(body.payment_status)
  ) {
    return Response.json({ error: "Invalid payment_status" }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
