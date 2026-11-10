const PERSON_REQUEST_PATTERNS = [
  /\b(?:talk|speak|chat)\s+(?:to|with)\s+(?:(?:your|a|an|the)\s+)?(?:human|person|real person|agent|someone|somebody|representative|support|manager|supervisor|owner|boss|customer care)\b/i,
  /\b(?:connect|transfer|put)\s+(?:(?:me|us)\s+)?(?:(?:through|over)\s+)?(?:to|with)?\s*(?:(?:your|a|an|the)\s+)?(?:human|person|real person|agent|someone|somebody|representative|support|manager|supervisor|owner|boss|customer care)\b/i,
  /\b(?:i\s+)?(?:need|want|would like)\s+(?:to\s+)?(?:talk|speak|chat)\s+(?:to|with)\s+(?:(?:your|a|an|the)\s+)?(?:human|person|real person|agent|someone|somebody|representative|support|manager|supervisor|owner|boss|customer care)\b/i,
  /\b(?:human|real person|live agent|representative|manager|supervisor|owner)\s+(?:please|now)\b/i,
  /(?:மனிதரிடம்|ஒருவரிடம்|நேரடியாக\s*பேச|மனுஷனிடம்)/u,
];

export function isPersonHandoffRequest(message: string, customKeywords: string[] = []): boolean {
  if (PERSON_REQUEST_PATTERNS.some((pattern) => pattern.test(message))) return true;
  const normalizedMessage = message.toLocaleLowerCase();
  return customKeywords.some((keyword) => keyword.trim() && normalizedMessage.includes(keyword.trim().toLocaleLowerCase()));
}
