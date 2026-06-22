const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://rjqxwxlxhlthbtkhrpeg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcXh3eGx4aGx0aGJ0a2hycGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMzMDM2NCwiZXhwIjoyMDg5OTA2MzY0fQ.D4Bpeq1_ygi8ADaB51inrNwDbN_YLhkuy-WMYI1Jva8'
);

async function run() {
  const { data: biz, error } = await supabase
    .from('businesses')
    .select('id, welcome_message, system_prompt');

  if (error) {
    console.error('Error fetching businesses:', error);
    return;
  }
  console.log('Businesses:', JSON.stringify(biz, null, 2));
}

run();
