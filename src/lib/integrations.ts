export type IntegrationLinkInput = { label: string; sourceCode: string; prefilledText: string };

export function normalizeSourceCode(value: string): string {
  return value.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40);
}

export function buildClickToChatUrl(phone: string, message: string, sourceCode: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("Enter a valid WhatsApp number with country code");
  const code = normalizeSourceCode(sourceCode);
  if (!code) throw new Error("Enter a source code");
  const text = `${message.trim()}\n\nSource: ${code}`.trim();
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function parseClickToChatSource(message: string): string | null {
  const match = message.match(/(?:^|\n)\s*source\s*:\s*([\w-]{1,40})\s*$/im);
  return match ? normalizeSourceCode(match[1]) || null : null;
}

export function validateIntegrationLink(input: IntegrationLinkInput): IntegrationLinkInput {
  const label = input.label.trim().slice(0, 80);
  const sourceCode = normalizeSourceCode(input.sourceCode);
  const prefilledText = input.prefilledText.trim().slice(0, 500);
  if (!label || !sourceCode || !prefilledText) throw new Error("Label, source code and message are required");
  return { label, sourceCode, prefilledText };
}
