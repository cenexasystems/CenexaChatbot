"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createClient();

  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Check if user has a business profile linked — if not, send to onboarding
  try {
    const userId = signInData.user?.id;
    if (userId) {
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: profile } = await adminClient
        .from("profiles")
        .select("business_id")
        .eq("id", userId)
        .single();

      if (!profile?.business_id) {
        redirect("/onboard");
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("Login profile check error:", err);
    // Proceed to redirect("/") instead of crashing if the profile check fails unexpectedly
  }

  redirect("/");
}

export async function signup(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  
  // Note: For a real SaaS, you might want to require an invite code
  // or automatically create a "business" row after signup.
  // For now, this just creates the auth user.

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }
  
  redirect("/onboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
