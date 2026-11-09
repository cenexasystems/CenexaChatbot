import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const destination = request.nextUrl.clone();
  destination.pathname = "/login";
  destination.search = "";
  if (!tokenHash || type !== "invite") {
    destination.searchParams.set("error", "invalid_invitation");
    return NextResponse.redirect(destination);
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    destination.searchParams.set("error", "expired_invitation");
    return NextResponse.redirect(destination);
  }
  destination.searchParams.set("invite", "1");
  return NextResponse.redirect(destination);
}
