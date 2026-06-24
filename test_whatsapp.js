const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabaseUrl = 'https://fmukifauhpucsoiiivcf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdWtpZmF1aHB1Y3NvaWlpdmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzMjcyMiwiZXhwIjoyMDkwNzA4NzIyfQ.lXSWKcJJ_JBjIIAPISNTBGGjh6mkTPUlho5eMJuI6sQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSend() {
  const { data: businesses, error: bizErr } = await supabase.from('businesses').select('*');
  if (bizErr) {
    console.error("Error fetching businesses:", bizErr);
    return;
  }

  const to = '919840852311'; // Sanjana's WhatsApp number from DB
  console.log(`Sending test messages to ${to}...\n`);

  for (const biz of businesses) {
    console.log(`Testing business: ${biz.name} (Phone ID: ${biz.phone_number_id})`);
    if (!biz.phone_number_id || !biz.access_token) {
      console.log(`❌ Missing credentials for ${biz.name}\n`);
      continue;
    }

    try {
      const url = `https://graph.facebook.com/v22.0/${biz.phone_number_id}/messages`;
      console.log(`POST to ${url}`);
      
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${biz.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: `Test message from Cenexa Chatbot for business: ${biz.name}` },
        }),
      });

      const status = res.status;
      const json = await res.json();
      console.log(`Status: ${status}`);
      console.log("Response:", JSON.stringify(json, null, 2));
      console.log("-------------------------------------------\n");
    } catch (e) {
      console.error(`Error sending message for ${biz.name}:`, e);
    }
  }
}

testSend().catch(console.error);
