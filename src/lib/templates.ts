export type TemplateCategory = "UTILITY" | "MARKETING";
export type TemplateButton = { type: "QUICK_REPLY"; text: string } | { type: "URL"; text: string; url: string };
export type TemplateDraft = {
  name: string;
  language: string;
  category: TemplateCategory;
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: TemplateButton[];
  examples?: string[];
};

export function templateVariableCount(text: string): number {
  const indices = [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
  if (indices.length === 0) return 0;
  if (indices.some((value, index) => value !== index + 1)) return -1;
  return indices.length;
}
export function validateTemplateDraft(input: unknown): { ok: true; value: TemplateDraft } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Template details are required" };
  const value = input as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const language = typeof value.language === "string" ? value.language.trim() : "";
  const body = typeof value.body === "string" ? value.body.trim() : "";
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name) || name.length > 512) return { ok: false, error: "Name must use lowercase letters, numbers, and underscores" };
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) return { ok: false, error: "Enter a valid language code, such as en or en_US" };
  if (value.category !== "UTILITY" && value.category !== "MARKETING") return { ok: false, error: "Choose Utility or Marketing" };
  if (!body || body.length > 1024) return { ok: false, error: "Body text is required and must be at most 1024 characters" };
  const bodyVariables = templateVariableCount(body);
  if (bodyVariables < 0) return { ok: false, error: "Body variables must be sequential, starting with {{1}}" };
  const examples = Array.isArray(value.examples) ? value.examples : [];
  if (examples.length !== bodyVariables || examples.some((item) => typeof item !== "string" || !item.trim() || item.length > 100)) {
    return { ok: false, error: `Provide one example value for each of the ${bodyVariables} body variables` };
  }
  const header = typeof value.header === "string" ? value.header.trim() : "";
  const footer = typeof value.footer === "string" ? value.footer.trim() : "";
  if (header.length > 60 || footer.length > 60) return { ok: false, error: "Header and footer are limited to 60 characters" };
  if (header.includes("{{")) return { ok: false, error: "Header variables are not supported in this editor yet" };
  const buttons = Array.isArray(value.buttons) ? value.buttons : [];
  if (buttons.length > 3) return { ok: false, error: "Templates can have up to three buttons" };
  for (const button of buttons) {
    if (!button || typeof button !== "object") return { ok: false, error: "Invalid button" };
    const b = button as Record<string, unknown>;
    if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 25) return { ok: false, error: "Button labels must be 1–25 characters" };
    if (b.type === "URL") {
      try {
        const url = new URL(String(b.url));
        if (url.protocol !== "https:") throw new Error("https required");
      } catch { return { ok: false, error: "URL buttons need a valid HTTPS link" }; }
    } else if (b.type !== "QUICK_REPLY") return { ok: false, error: "Choose a quick reply or URL button" };
  }
  return { ok: true, value: { name, language, category: value.category, header: header || null, body, footer: footer || null, buttons: buttons as TemplateButton[], examples: examples as string[] } };
}

export function buildMetaTemplatePayload(draft: TemplateDraft): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (draft.header) components.push({ type: "HEADER", format: "TEXT", text: draft.header });
  const body: Record<string, unknown> = { type: "BODY", text: draft.body };
  if (draft.examples?.length) body.example = { body_text: [draft.examples] };
  components.push(body);
  if (draft.footer) components.push({ type: "FOOTER", text: draft.footer });
  if (draft.buttons?.length) components.push({ type: "BUTTONS", buttons: draft.buttons.map((button) => button.type === "URL"
    ? { type: "URL", text: button.text, url: button.url }
    : { type: "QUICK_REPLY", text: button.text }) });
  return { name: draft.name, language: draft.language, category: draft.category, components };
}

export function mapMetaTemplateStatus(status: unknown): "draft" | "pending" | "approved" | "rejected" | "paused" {
  switch (String(status ?? "").toUpperCase()) {
    case "APPROVED": return "approved";
    case "REJECTED": return "rejected";
    case "PAUSED": case "DISABLED": return "paused";
    case "PENDING": case "IN_APPEAL": return "pending";
    default: return "draft";
  }
}
