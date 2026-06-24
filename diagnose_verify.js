const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabaseUrl = 'https://fmukifauhpucsoiiivcf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdWtpZmF1aHB1Y3NvaWlpdmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzMjcyMiwiZXhwIjoyMDkwNzA4NzIyfQ.lXSWKcJJ_JBjIIAPISNTBGGjh6mkTPUlho5eMJuI6sQ';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

async function simulateVerify() {
  // 1. Find a pending conversation
  const { data: convos } = await adminSupabase
    .from('conversations')
    .select('id, phone, business_id, payment_status, name')
    .eq('payment_status', 'pending')
    .limit(3);

  if (!convos || convos.length === 0) {
    console.log('No pending conversations found. Finding any conversation...');
    const { data: anyConvos } = await adminSupabase
      .from('conversations')
      .select('id, phone, business_id, payment_status, name')
      .not('business_id', 'is', null)
      .limit(3);
    
    if (!anyConvos || anyConvos.length === 0) {
      console.log('No conversations found at all!');
      return;
    }
    
    const c = anyConvos[0];
    console.log(`Using conversation: ${c.name} (${c.phone}), business_id: ${c.business_id}, status: ${c.payment_status}`);
    await testSend(c);
    return;
  }

  const c = convos[0];
  console.log(`Found pending conversation: ${c.name} (${c.phone}), business_id: ${c.business_id}`);
  await testSend(c);
}

async function testSend(conversation) {
  console.log('\n--- Step 1: Fetch business credentials ---');
  const { data: biz, error: bizErr } = await adminSupabase
    .from('businesses')
    .select('phone_number_id, access_token, name')
    .eq('id', conversation.business_id)
    .single();

  if (bizErr) {
    console.error('❌ Business fetch ERROR:', bizErr.message);
    return;
  }
  if (!biz) {
    console.error('❌ Business is NULL - cannot send WhatsApp message');
    return;
  }
  
  console.log(`✅ Business found: phone_number_id=${biz.phone_number_id}, has_token=${!!biz.access_token}`);

  console.log('\n--- Step 2: Send WhatsApp message ---');
  const message = '✅ Your payment has been successfully verified! Thank you. We will process your order shortly.';
  
  const url = `https://graph.facebook.com/v22.0/${biz.phone_number_id}/messages`;
  console.log(`POST to: ${url}`);
  console.log(`To: ${conversation.phone}`);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${biz.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: conversation.phone,
      type: 'text',
      text: { body: message },
    }),
  });
  
  const json = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(json, null, 2));
  
  if (res.ok) {
    console.log('\n✅ WhatsApp message sent successfully!');
  } else {
    console.error('\n❌ WhatsApp message FAILED!', json.error);
  }
}

simulateVerify().catch(console.error);
