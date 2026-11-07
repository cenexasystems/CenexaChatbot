-- Per-business AI assistant configuration. Additive only.
alter table businesses
  add column if not exists handoff_rules text,
  add column if not exists handoff_keywords text[] not null default array[]::text[],
  add column if not exists greeting_phrases text[] not null default array['hi', 'hello', 'hey', 'hii', 'helo', 'hai', 'வணக்கம்', 'ஹலோ']::text[],
  add column if not exists url_rewrite_from text,
  add column if not exists url_rewrite_to text;

-- Preserve the existing rewrite only for businesses whose saved prompt content uses it.
update businesses
   set url_rewrite_from = 'https://b2-bridal-studio-upgraded.vercel.app',
       url_rewrite_to = 'https://b2bridalstudio.com'
 where url_rewrite_from is null
   and (
     system_prompt like '%https://b2-bridal-studio-upgraded.vercel.app%'
     or welcome_message like '%https://b2-bridal-studio-upgraded.vercel.app%'
   );
