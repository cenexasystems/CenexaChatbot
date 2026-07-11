const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fmukifauhpucsoiiivcf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdWtpZmF1aHB1Y3NvaWlpdmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzMjcyMiwiZXhwIjoyMDkwNzA4NzIyfQ.lXSWKcJJ_JBjIIAPISNTBGGjh6mkTPUlho5eMJuI6sQ';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

async function checkRows() {
  const { data, error } = await adminSupabase.from('businesses').select('*');
  if (data) {
    for (const b of data) {
      console.log(`Business: ${b.name}`);
      console.log(`Welcome: ${b.welcome_message?.substring(0, 50)}`);
      console.log(`System Prompt: ${b.system_prompt?.substring(0, 100)}...`);
      console.log('---');
    }
  }
}
checkRows();
