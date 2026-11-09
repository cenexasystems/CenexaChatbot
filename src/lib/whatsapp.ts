import { GRAPH_BASE } from "@/lib/graph";

interface SendOptions {
  phoneNumberId?: string;
  accessToken?: string;
  headerParameters?: string[];
  buttons?: Array<{ index: number; text: string }>;
}

async function postMessage(payload: Record<string, unknown>, options: SendOptions) {
  const phoneNumberId = options.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = options.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;

  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  return res.json();
}

export async function sendWhatsAppMessage(to: string, body: string, options: SendOptions = {}) {
  return postMessage({ to, type: "text", text: { body } }, options);
}

export async function sendWhatsAppImage(
  to: string,
  url: string,
  caption: string = "",
  options: SendOptions = {}
) {
  return postMessage({ to, type: "image", image: { link: url, caption } }, options);
}

export async function sendWhatsAppTemplate(
  to: string,
  name: string,
  languageCode: string,
  bodyParameters: string[],
  options: SendOptions = {}
) {
  const components: Record<string, unknown>[] = [];
  if (options.headerParameters?.length) {
    components.push({ type: "header", parameters: options.headerParameters.map((text) => ({ type: "text", text })) });
  }
  if (bodyParameters.length) {
    components.push({ type: "body", parameters: bodyParameters.map((text) => ({ type: "text", text })) });
  }
  for (const button of options.buttons ?? []) {
    components.push({ type: "button", sub_type: "url", index: String(button.index), parameters: [{ type: "text", text: button.text }] });
  }
  return postMessage(
    {
      to,
      type: "template",
      template: {
        name,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    },
    options
  );
}

/** Pull the wamid out of a Cloud API send response (used to de-dupe against smb_message_echoes). */
export function extractWamid(result: unknown): string | null {
  const res = result as { messages?: Array<{ id?: string }> } | null | undefined;
  return res?.messages?.[0]?.id ?? null;
}
