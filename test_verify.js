const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fmukifauhpucsoiiivcf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdWtpZmF1aHB1Y3NvaWlpdmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzMjcyMiwiZXhwIjoyMDkwNzA4NzIyfQ.lXSWKcJJ_JBjIIAPISNTBGGjh6mkTPUlho5eMJuI6sQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testVerify() {
  console.log("Fetching a pending/none conversation...");
  const { data: convos, error: fetchErr } = await supabase
    .from('conversations')
    .select('*')
    .limit(5);

  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }

  console.log(`Found ${convos.length} conversations.`);
  const target = convos[0];
  if (!target) {
    console.log("No conversations found to test.");
    return;
  }

  console.log(`Target Conversation: ID=${target.id}, Phone=${target.phone}, Current Status=${target.payment_status}`);

  console.log("Attempting to update payment_status to 'verified'...");
  const { data: updated, error: updateErr } = await supabase
    .from('conversations')
    .update({ payment_status: 'verified' })
    .eq('id', target.id)
    .select()
    .single();

  if (updateErr) {
    console.error("Update error:", updateErr);
  } else {
    console.log("Successfully updated! New payment_status:", updated.payment_status);
    
    // Reset it back
    console.log("Resetting payment_status back to original...");
    await supabase
      .from('conversations')
      .update({ payment_status: target.payment_status || 'none' })
      .eq('id', target.id);
  }
}

testVerify().catch(console.error);
