const fetch = require('node-fetch');

// Test if the new verify-payment code is deployed on Vercel
// We'll call a conversation ID and check the response format
// If it has "whatsapp_sent" field -> new code deployed
// If it doesn't -> old code still running

async function testLiveDeployment() {
  const baseUrl = 'https://cenexa-chatbot.vercel.app';
  
  // First check if we can even reach the site
  console.log('Testing Vercel deployment...');
  
  try {
    const res = await fetch(`${baseUrl}/api/conversations`, {
      headers: {
        'Cookie': '' // No auth - will return 401
      }
    });
    console.log('GET /api/conversations status:', res.status);
    const text = await res.text();
    console.log('Response:', text.substring(0, 200));
  } catch (e) {
    console.error('Network error:', e.message);
  }
}

testLiveDeployment();
