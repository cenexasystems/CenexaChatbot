// UI labels in English and Tamil. Hindi comes in Phase 2.
// Tamil strings are a first draft: have a native speaker review them before launch.

export type Lang = "en" | "ta";

const STRINGS = {
  "nav.today": { en: "Today", ta: "இன்று" },
  // Tab labels must fit ~60px on a phone bottom bar: keep them short.
  "nav.inbox": { en: "Inbox", ta: "அரட்டை" },
  "nav.contacts": { en: "Contacts", ta: "நபர்கள்" },
  "nav.campaigns": { en: "Campaigns", ta: "சலுகை" },
  "nav.assistant": { en: "AI", ta: "AI" },
  "nav.more": { en: "More", ta: "மேலும்" },

  "today.greeting.morning": { en: "Good morning", ta: "காலை வணக்கம்" },
  "today.greeting.afternoon": { en: "Good afternoon", ta: "மதிய வணக்கம்" },
  "today.greeting.evening": { en: "Good evening", ta: "மாலை வணக்கம்" },
  "today.waiting": { en: "People waiting for you", ta: "உங்களுக்காக காத்திருப்பவர்கள்" },
  "today.money": { en: "Money to confirm", ta: "உறுதிசெய்ய வேண்டிய பணம்" },
  "today.ai": { en: "AI is handling", ta: "AI பதில் அளிக்கிறது" },
  "today.leads": { en: "New today", ta: "இன்று புதியவர்கள்" },

  "filter.all": { en: "All", ta: "அனைத்தும்" },
  "filter.needs-you": { en: "Needs you", ta: "நீங்கள் பதில் தர வேண்டும்" },
  "filter.ai": { en: "AI handling", ta: "AI பதில் அளிக்கிறது" },
  "filter.money": { en: "Money to confirm", ta: "பணம் உறுதிசெய்ய" },
  "filter.waiting-payment": { en: "Waiting for payment", ta: "பணத்திற்காக காத்திருப்பு" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function translate(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}
