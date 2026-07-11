const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fmukifauhpucsoiiivcf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdWtpZmF1aHB1Y3NvaWlpdmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzMjcyMiwiZXhwIjoyMDkwNzA4NzIyfQ.lXSWKcJJ_JBjIIAPISNTBGGjh6mkTPUlho5eMJuI6sQ';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  const { data, error } = await adminSupabase
    .from('businesses')
    .select('id, name, system_prompt, welcome_message')
    .ilike('name', '%tirupathi%');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  for (const b of data) {
    console.log(`=== ${b.name} ===`);
    console.log(`ID: ${b.id}`);
    console.log(`\nWELCOME MESSAGE:\n${b.welcome_message}`);
    console.log(`\nSYSTEM PROMPT:\n${b.system_prompt}`);
    console.log('\n---');
  }
}

check();
