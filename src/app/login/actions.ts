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
      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .select("business_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        console.error("Login profile check error:", profileError.message);
        await supabase.auth.signOut();
        return { error: "We could not load your business profile. Please try again." };
      }

      if (!profile?.business_id) {
        const { data: platformAdmin, error: platformError } = await adminClient.from("platform_admins").select("user_id").eq("user_id", userId).eq("disabled", false).maybeSingle();
        if (platformError) {
          await supabase.auth.signOut();
          return { error: "We could not verify platform access. Please try again." };
        }
        redirect(platformAdmin ? "/admin" : "/onboard");
      }
      redirect("/");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("Login profile check error:", err);
    return { error: "We could not load your business profile. Please try again." };
  }

  redirect("/");
}

export async function acceptInvitePassword(formData: FormData) {
  const password = formData.get("password") as string;
  if (!password || password.length < 8) return { error: "Choose a password with at least 8 characters" };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Your invitation link has expired. Ask your admin to send a new invitation." };
  const adminClient = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profile } = await adminClient.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (profile?.status !== "invited") return { error: "This invitation is no longer active. Sign in or ask your admin for help." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
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
