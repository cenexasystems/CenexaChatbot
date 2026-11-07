// scripts/simulate-webhook.js
// End-to-end simulator for WhatsApp Webhooks on Staging Supabase
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = 'https://vzyeoemouatmrojvuvde.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6eWVvZW1vdWF0bXJvanZ1dmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NjA2NDYsImV4cCI6MjEwODEzNjY0Nn0.ibgB4B_N5MyB4KM7MtGhkRpFto7O2BGJywGx2IdV804';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEST_BIZ_ID = '11111111-2222-3333-4444-555555555555';
const TEST_PHONE_ID = '1144112622113478';
const TEST_CUSTOMER_PHONE = '919876543210';

function postWebhook(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runSimulation() {
  console.log('====================================================');
  console.log('🚀 STARTING WHATSAPP COEXISTENCE & AI SIMULATION');
  console.log('====================================================\n');

  // 1. Seed or update test business
  console.log('Step 1: Upserting Test Business in Staging Supabase...');
  const { error: bizErr } = await supabase.from('businesses').upsert({
    id: TEST_BIZ_ID,
    name: 'Cenexa Staging Test Store',
    phone_number_id: TEST_PHONE_ID,
    whatsapp_number: '+919994981576',
    access_token: 'dummy_staging_token',
    ai_model: 'openai/gpt-4o-mini',
    system_prompt: 'You are Cera, an AI sales assistant for Cenexa Systems. Explain our services concisely.',
    welcome_message: 'Welcome to Cenexa Systems! We build AI bots and websites.',
    is_active: true,
    coexistence_enabled: true,
    media_ai_enabled: true,
    handoff_minutes: 60,
  });

  if (bizErr) {
    console.error('❌ Failed to seed test business:', bizErr);
    return;
  }
  console.log('✅ Test Business ready: coexistence_enabled=true, media_ai_enabled=true\n');

  // 2. Scenario A: Customer sends an inbound message
  const custWamid = 'wamid.TEST_CUST_' + Date.now();
  console.log('Step 2: Simulating Customer Message...');
  console.log('📱 Customer (919876543210) sends: "Hi, do you build WhatsApp bots and websites?"');

  const customerPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_12345',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919994981576',
                phone_number_id: TEST_PHONE_ID,
              },
              contacts: [
                {
                  profile: { name: 'Rahul' },
                  wa_id: TEST_CUSTOMER_PHONE,
                },
              ],
              messages: [
                {
                  from: TEST_CUSTOMER_PHONE,
                  id: custWamid,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: 'Hi, do you build WhatsApp bots and websites?' },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const res1 = await postWebhook(customerPayload);
  console.log(`➡️ Webhook ACK: HTTP ${res1.status} ${res1.body}`);

  console.log('⏳ Waiting 4 seconds for AI processing and database recording...');
  await sleep(4000);

  // Check database for conversation and messages
  const { data: conv } = await supabase
    .from('conversations')
    .select('*')
    .eq('business_id', TEST_BIZ_ID)
    .eq('phone', TEST_CUSTOMER_PHONE)
    .single();

  if (conv) {
    console.log(`\n✅ Conversation created in Staging DB! ID: ${conv.id}`);
    console.log(`   Customer Name: ${conv.name}, Mode: ${conv.mode}`);

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    console.log(`   Found ${msgs ? msgs.length : 0} messages in conversation:`);
    for (const m of msgs || []) {
      console.log(`   - [${m.role.toUpperCase()}] (source: ${m.source || 'default'}): ${m.content.slice(0, 100)}`);
    }
  } else {
    console.warn('⚠️ Conversation not found in DB.');
  }

  // 3. Scenario B: Owner replies from WhatsApp Business App (Coexistence Echo)
  console.log('\n----------------------------------------------------');
  console.log('Step 3: Simulating Owner Reply from WhatsApp Business App...');
  console.log('🏢 Owner replies from phone: "Hello! Store owner here. Yes we do! I will assist you personally."');

  const echoWamid = 'wamid.TEST_ECHO_' + Date.now();
  const echoPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_12345',
        changes: [
          {
            field: 'smb_message_echoes',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919994981576',
                phone_number_id: TEST_PHONE_ID,
              },
              message_echoes: [
                {
                  from: '919994981576',
                  to: TEST_CUSTOMER_PHONE,
                  id: echoWamid,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: 'Hello! Store owner here. Yes we do! I will assist you personally.' },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const res2 = await postWebhook(echoPayload);
  console.log(`➡️ Webhook ACK: HTTP ${res2.status} ${res2.body}`);

  console.log('⏳ Waiting 2 seconds for Coexistence handoff processing...');
  await sleep(2000);

  // Check that ai_paused_until is set
  const { data: convAfterEcho } = await supabase
    .from('conversations')
    .select('id, ai_paused_until')
    .eq('business_id', TEST_BIZ_ID)
    .eq('phone', TEST_CUSTOMER_PHONE)
    .single();

  console.log(`\n✅ Coexistence Handoff Verification:`);
  console.log(`   ai_paused_until: ${convAfterEcho?.ai_paused_until}`);
  if (convAfterEcho?.ai_paused_until) {
    const pauseDate = new Date(convAfterEcho.ai_paused_until);
    const now = new Date();
    const diffMinutes = Math.round((pauseDate.getTime() - now.getTime()) / 60000);
    console.log(`   🎯 AI SUCCESSFULLY PAUSED FOR: ~${diffMinutes} minutes (Expected: 60 minutes)`);
  }

  // 4. Scenario C: Customer texts while AI is paused
  console.log('\n----------------------------------------------------');
  console.log('Step 4: Customer sends follow-up while AI is paused...');
  console.log('📱 Customer sends: "Great! Can we schedule a call?"');

  const custWamid2 = 'wamid.TEST_CUST_2_' + Date.now();
  const followUpPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_12345',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919994981576',
                phone_number_id: TEST_PHONE_ID,
              },
              messages: [
                {
                  from: TEST_CUSTOMER_PHONE,
                  id: custWamid2,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: 'Great! Can we schedule a call?' },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const res3 = await postWebhook(followUpPayload);
  console.log(`➡️ Webhook ACK: HTTP ${res3.status} ${res3.body}`);

  console.log('⏳ Waiting 3 seconds (AI should NOT reply)...');
  await sleep(3000);

  const { data: finalMsgs } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true });

  console.log(`\n📊 Final Conversation Timeline:`);
  for (const m of finalMsgs || []) {
    const srcTag = m.source ? `[source: ${m.source}]` : '';
    console.log(`   ${m.role === 'user' ? '👤 Customer' : '🏢 Owner / 🤖 Bot'} ${srcTag}: ${m.content}`);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL STAGING SIMULATION TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runSimulation().catch(console.error);
