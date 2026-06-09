const url = 'https://rjqxwxlxhlthbtkhrpeg.supabase.co/rest/v1/businesses?select=id,welcome_message,system_prompt';
const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcXh3eGx4aGx0aGJ0a2hycGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMzMDM2NCwiZXhwIjoyMDg5OTA2MzY0fQ.D4Bpeq1_ygi8ADaB51inrNwDbN_YLhkuy-WMYI1Jva8';

async function run() {
  const res = await fetch(url, {
    headers: {
      'apikey': apiKey,
      'Authorization': 'Bearer ' + apiKey
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
