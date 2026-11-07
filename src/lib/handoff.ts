const PERSON_REQUEST_PATTERNS = [
  /\b(?:talk|speak|chat)\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+)?(?:human|person|real person|agent|someone|representative|support)\b/i,
  /\b(?:connect|transfer)\s+(?:me\s+)?(?:to\s+)?(?:a\s+|an\s+|the\s+)?(?:human|person|agent|someone|representative|support)\b/i,
  /\b(?:human|real person|live agent|representative)\s+(?:please|now)\b/i,
  /(?:மனிதரிடம்|ஒருவரிடம்|நேரடியாக\s*பேச|மனுஷனிடம்)/u,
];

export function isPersonHandoffRequest(message: string, customKeywords: string[] = []): boolean {
  if (PERSON_REQUEST_PATTERNS.some((pattern) => pattern.test(message))) return true;
  const normalizedMessage = message.toLocaleLowerCase();
  return customKeywords.some((keyword) => keyword.trim() && normalizedMessage.includes(keyword.trim().toLocaleLowerCase()));
}
