import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: businesses } = await supabase.from("businesses").select("*");
  let results = [];

  for (const biz of businesses || []) {
    if (biz.access_token) {
      const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${biz.access_token}&access_token=${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
      const debugRes = await fetch(debugUrl);
      const debugData = await debugRes.json();
      
      let wabaId = null;
      for (const scope of debugData.data?.granular_scopes ?? []) {
        if (scope.scope === "whatsapp_business_management" && scope.target_ids?.length > 0) {
          wabaId = scope.target_ids[0];
          break;
        }
      }

      if (wabaId) {
        // Subscribe the WABA to the webhook
        const subRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`, {
          method: "POST",
          headers: { Authorization: `Bearer ${biz.access_token}` }
        });
        const subData = await subRes.json();
        
        // Fetch phone numbers to fix phone_number_id in database
        const phoneRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/phone_numbers`, {
          headers: { Authorization: `Bearer ${biz.access_token}` }
        });
        const phoneData = await phoneRes.json();
        
        let phoneNumberId = null;
        if (phoneData.data && phoneData.data.length > 0) {
          phoneNumberId = phoneData.data[0].id;
          
          // Update database with correct phone number ID
          await supabase.from("businesses").update({ 
            phone_number_id: phoneNumberId,
            waba_id: wabaId
          }).eq("id", biz.id);
        }

        results.push({ wabaId, phoneNumberId, subData });
      }
    }
  }

  return NextResponse.json({ success: true, fixed: true, results });
}
