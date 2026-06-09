interface SendOptions {
  phoneNumberId?: string;
  accessToken?: string;
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  options: SendOptions = {}
) {
  const phoneNumberId = options.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = options.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );
  return res.json();
}

export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption: string = "",
  options: SendOptions = {}
) {
  const phoneNumberId = options.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = options.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
          link: imageUrl,
          caption: caption,
        },
      }),
    }
  );
  return res.json();
}
