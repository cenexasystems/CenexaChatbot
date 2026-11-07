export const DEFAULT_GREETING_PHRASES = ["hi", "hello", "hey", "hii", "helo", "hai", "வணக்கம்", "ஹலோ"];

function normalizedGreeting(value: string): string {
  return value.trim().replace(/[\s!?.。！？]+$/gu, "").toLocaleLowerCase();
}

export function isConfiguredGreeting(message: string, phrases?: string[] | null): boolean {
  const configured = phrases ?? DEFAULT_GREETING_PHRASES;
  const messageKey = normalizedGreeting(message);
  return Boolean(messageKey) && configured.some((phrase) => normalizedGreeting(phrase) === messageKey);
}

export function rewriteConfiguredUrls(
  value: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined
): string | null {
  if (value == null) return null;
  if (!from || !to || from === to) return value;
  return value.split(from).join(to);
}

export function appendHandoffRules(systemPrompt: string | null | undefined, rules: string | null | undefined): string | undefined {
  const prompt = systemPrompt?.trim();
  const handoff = rules?.trim();
  if (!prompt && !handoff) return undefined;
  if (!handoff) return prompt;
  return `${prompt ?? ""}${prompt ? "\n\n" : ""}HAND-OFF RULES\n${handoff}`;
}
