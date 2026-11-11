import { analyzeVoiceNote } from "@/lib/media-ai";
import { conversationNotFound, getOwnedConversation, requireBusinessAccess, requireStrictPermission } from "@/lib/api-auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const { id, msgId } = await params;
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requireStrictPermission(access, "conversation_reply");
  if (denied) return denied;

  const { conversation, error: conversationError } = await getOwnedConversation(access.admin, access.businessId, id, "id");
  if (conversationError) return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  if (!conversation) return conversationNotFound();

  const [{ data: business, error: businessError }, { data: message, error: messageError }] = await Promise.all([
    access.admin.from("businesses").select("media_ai_enabled, openrouter_api_key, vision_model").eq("id", access.businessId).maybeSingle(),
    access.admin.from("messages").select("id, media_type, media_url, transcript").eq("id", msgId).eq("conversation_id", id).maybeSingle(),
  ]);
  if (businessError || messageError) return Response.json({ error: "Unable to load voice note" }, { status: 500 });
  if (!message || message.media_type !== "audio") return Response.json({ error: "Voice note not found" }, { status: 404 });
  if (message.transcript) return Response.json({ transcript: message.transcript, alreadyTranscribed: true });
  if (!business?.media_ai_enabled) return Response.json({ error: "Enable Voice and image understanding in Assistant Studio first." }, { status: 409 });
  if (!(process.env.TRANSCRIBE_API_KEY ?? process.env.OPENAI_API_KEY)) {
    return Response.json({ error: "Voice transcription is not configured on the server. Add TRANSCRIBE_API_KEY (or OPENAI_API_KEY) and redeploy." }, { status: 503 });
  }
  if (!message.media_url) return Response.json({ error: "The voice recording is no longer available." }, { status: 410 });

  let audioUrl: URL;
  let storageUrl: URL;
  try {
    audioUrl = new URL(message.media_url);
    storageUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    return Response.json({ error: "The stored voice recording URL is invalid." }, { status: 400 });
  }
  if (audioUrl.origin !== storageUrl.origin || !audioUrl.pathname.startsWith("/storage/v1/object/public/whatsapp-media/")) {
    return Response.json({ error: "The stored voice recording URL is not from the WhatsApp media bucket." }, { status: 400 });
  }

  let audioResponse: Response;
  try {
    audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(20_000) });
  } catch {
    return Response.json({ error: "Could not download the voice recording. Please try again." }, { status: 502 });
  }
  if (!audioResponse.ok) return Response.json({ error: "Could not download the voice recording. Please try again." }, { status: 502 });
  const maxBytes = 10 * 1024 * 1024;
  const declaredSize = Number(audioResponse.headers.get("content-length") ?? 0);
  if (declaredSize > maxBytes) return Response.json({ error: "This voice recording is too large to transcribe." }, { status: 413 });
  if (!audioResponse.body) return Response.json({ error: "The voice recording is empty." }, { status: 422 });
  const reader = audioResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return Response.json({ error: "This voice recording is too large to transcribe." }, { status: 413 });
    }
    chunks.push(value);
  }
  if (!received) return Response.json({ error: "The voice recording is empty." }, { status: 422 });
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const mimeType = (audioResponse.headers.get("content-type") ?? "audio/ogg").split(";")[0].trim().toLowerCase();
  const result = await analyzeVoiceNote(buffer, mimeType, {
    apiKey: business.openrouter_api_key ?? undefined,
    model: business.vision_model ?? undefined,
  });
  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : result.reason === "too_large" ? 413 : 422;
    if (result.reason === "failed") {
      const providerStatus = result.providerStatus;
      const providerCode = result.providerCode?.toLowerCase();
      if (providerStatus === 401 || providerCode === "invalid_api_key") {
        return Response.json({ error: `${result.provider ?? "Transcription provider"} rejected the API key. Check that the key matches the provider configured for transcription.` }, { status: 502 });
      }
      if (providerStatus === 429 || providerCode === "insufficient_quota") {
        return Response.json({ error: "OpenAI rejected transcription because of a quota or rate limit. Check API billing, credits, and usage limits for the key’s project." }, { status: 502 });
      }
      if (providerStatus === 403) {
        return Response.json({ error: "OpenAI denied transcription for this API project. Check the key’s project permissions and API access." }, { status: 502 });
      }
      return Response.json({ error: `The transcription provider failed${providerStatus ? ` (HTTP ${providerStatus})` : ""}. Check the Vercel function log for the provider error.` }, { status: 502 });
    }
    return Response.json({ error: result.reason === "not_configured" ? "Voice transcription is not configured on the server." : result.reason === "too_large" ? "This voice recording is too large to transcribe." : "The voice recording could not be understood. Try sending it again." }, { status });
  }

  const { error: updateError } = await access.admin
    .from("messages")
    .update({ transcript: result.analysis.transcript, media_analysis: result.analysis })
    .eq("id", msgId)
    .eq("conversation_id", id);
  if (updateError) return Response.json({ error: "Transcript was generated but could not be saved." }, { status: 500 });
  return Response.json({ transcript: result.analysis.transcript });
}
