import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status, note } = body as { status?: string; note?: string };

  const validStatuses = ["none", "pending", "verified", "rejected"];
  if (!status || !validStatuses.includes(status)) {
    return Response.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = { payment_status: status };
  if (note !== undefined) update.internal_note = note;

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
