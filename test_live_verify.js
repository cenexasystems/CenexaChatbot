const fetch = require('node-fetch');

async function testLiveVerifyEndpoint() {
  const url = 'https://cenexa-chatbot.vercel.app/api/conversations/e28e7f08-d296-4bbb-b0ae-182a393d36ca/verify-payment';
  
  console.log(`Sending POST to ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'verified' })
    });
    
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response: ${text}`);
    
    if (text.includes('whatsapp_sent') || text.includes('whatsapp_error')) {
      console.log('✅ NEW CODE IS DEPLOYED!');
    } else {
      console.log('❌ OLD CODE IS RUNNING!');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testLiveVerifyEndpoint();
