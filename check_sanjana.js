const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fmukifauhpucsoiiivcf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdWtpZmF1aHB1Y3NvaWlpdmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzMjcyMiwiZXhwIjoyMDkwNzA4NzIyfQ.lXSWKcJJ_JBjIIAPISNTBGGjh6mkTPUlho5eMJuI6sQ';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

async function checkMessages() {
  console.log("Checking conversations for Sanjana...");
  const { data: convos, error } = await adminSupabase
    .from('conversations')
    .select('*')
    .eq('phone', '919840852311');
    
  if (error) {
    console.error("Error fetching convos:", error);
    return;
  }
  
  if (!convos || convos.length === 0) {
    console.log("No conversation found for Sanjana");
    return;
  }
  
  const convo = convos[0];
  console.log("Conversation:", convo);
  
  console.log("\\nFetching messages for this conversation...");
  const { data: messages, error: msgError } = await adminSupabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (msgError) {
    console.error("Error fetching messages:", msgError);
    return;
  }
  
  console.log("Latest messages:");
  messages.forEach(m => console.log(`[${m.created_at}] ${m.role}: ${m.content}`));
}

checkMessages();
