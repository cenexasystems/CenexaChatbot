const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://rjqxwxlxhlthbtkhrpeg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcXh3eGx4aGx0aGJ0a2hycGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMzMDM2NCwiZXhwIjoyMDg5OTA2MzY0fQ.D4Bpeq1_ygi8ADaB51inrNwDbN_YLhkuy-WMYI1Jva8'
);

// Known users
const USERS = [
  { email: 'cenexasystems@gmail.com', id: '40015f74-aa3e-4304-b408-db858f653345' },
  { email: 'sparamusements@gmail.com', id: 'dbe00291-9ce4-493d-84b6-222fa6f28247' },
];

async function fixProfiles() {
  console.log("=== FIXING PROFILES & BUSINESSES ===\n");

  // Step 1: Check existing businesses
  const { data: existingBiz } = await supabase.from('businesses').select('*');
  console.log("Existing businesses:", existingBiz);

  // Step 2: Check existing profiles
  const { data: existingProfiles } = await supabase.from('profiles').select('*');
  console.log("Existing profiles:", existingProfiles);

  // Step 3: Find users WITHOUT profiles
  const profiledIds = (existingProfiles || []).map(p => p.id);
  const unprofiled = USERS.filter(u => !profiledIds.includes(u.id));
  console.log("\nUsers without profiles:", unprofiled.map(u => u.email));

  if (unprofiled.length === 0) {
    console.log("All users already have profiles! No fix needed.");
    return;
  }

  // Step 4: Create a business for Cenexa (the main business)
  let businessId;
  if (!existingBiz || existingBiz.length === 0) {
    console.log("\nCreating business for Cenexa Systems...");
    const { data: newBiz, error: bizErr } = await supabase
      .from('businesses')
      .insert({
        name: 'Cenexa Systems',
        is_active: true,
      })
      .select()
      .single();
    
    if (bizErr) {
      console.error("Error creating business:", bizErr.message);
      console.log("Business columns might be different. Let's check...");
      
      // Try with minimal fields
      const { data: newBiz2, error: bizErr2 } = await supabase
        .from('businesses')
        .insert({ name: 'Cenexa Systems' })
        .select()
        .single();
      
      if (bizErr2) {
        console.error("Still failing:", bizErr2.message);
        return;
      }
      businessId = newBiz2.id;
      console.log("Created business:", newBiz2);
    } else {
      businessId = newBiz.id;
      console.log("Created business:", newBiz);
    }
  } else {
    businessId = existingBiz[0].id;
    console.log("\nUsing existing business:", existingBiz[0]);
  }

  // Step 5: Create profiles for all users without one
  for (const user of unprofiled) {
    console.log(`\nCreating profile for ${user.email}...`);
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        business_id: businessId,
        role: 'admin',
      })
      .select()
      .single();
    
    if (profErr) {
      console.error(`Error creating profile for ${user.email}:`, profErr.message);
      
      // Try without role field
      const { data: profile2, error: profErr2 } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          business_id: businessId,
        })
        .select()
        .single();
      
      if (profErr2) {
        console.error(`Still failing:`, profErr2.message);
      } else {
        console.log(`Created profile (no role):`, profile2);
      }
    } else {
      console.log(`Created profile:`, profile);
    }
  }

  // Step 6: Fix conversations - link them to the business
  console.log("\n--- Linking orphaned conversations to the business ---");
  const { data: orphans, error: orphanErr } = await supabase
    .from('conversations')
    .select('id, phone, name')
    .is('business_id', null);
  
  if (orphanErr) {
    console.error("Error finding orphans:", orphanErr.message);
  } else {
    console.log(`Found ${orphans?.length || 0} conversations without business_id`);
    if (orphans && orphans.length > 0) {
      const { error: updateErr } = await supabase
        .from('conversations')
        .update({ business_id: businessId })
        .is('business_id', null);
      
      if (updateErr) console.error("Error updating:", updateErr.message);
      else console.log(`Linked ${orphans.length} conversations to business ${businessId}`);
    }
  }

  console.log("\n=== DONE ===");
  console.log("Users can now log in and see the dashboard.");
}

fixProfiles().catch(console.error);
