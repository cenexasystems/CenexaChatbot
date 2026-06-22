const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://rjqxwxlxhlthbtkhrpeg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcXh3eGx4aGx0aGJ0a2hycGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMzMDM2NCwiZXhwIjoyMDg5OTA2MzY0fQ.D4Bpeq1_ygi8ADaB51inrNwDbN_YLhkuy-WMYI1Jva8'
);

async function run() {
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching conversations:', error);
    return;
  }
  console.log('Conversations:', JSON.stringify(convs, null, 2));

  if (convs.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convs[0].id)
      .order('created_at', { ascending: false })
      .limit(10);
    console.log('Messages for latest conversation:', JSON.stringify(msgs, null, 2));
  }
}

run();
