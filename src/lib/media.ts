import { getSupabase } from "@/lib/supabase";
import { GRAPH_BASE } from "@/lib/graph";

export async function getMediaUrl(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  } catch { return null; }
}

export async function downloadMedia(
  mediaUrl: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    // Voice notes arrive as "audio/ogg; codecs=opus" — strip parameters so lookups work.
    const mimeType = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    return { buffer: Buffer.from(await res.arrayBuffer()), mimeType };
  } catch { return null; }
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
  };
  return map[mimeType] ?? "bin";
}

export function getMediaCategory(
  mimeType: string
): "image" | "audio" | "document" | "video" | "sticker" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

export async function processAndStoreMedia(
  mediaId: string,
  accessToken: string,
  businessId: string
): Promise<{
  publicUrl: string;
  mediaType: "image" | "audio" | "document" | "video" | "sticker";
  /** Raw bytes + MIME so callers can run transcription / vision without re-downloading. */
  buffer: Buffer;
  mimeType: string;
} | null> {
  const mediaUrl = await getMediaUrl(mediaId, accessToken);
  if (!mediaUrl) return null;

  const downloaded = await downloadMedia(mediaUrl, accessToken);
  if (!downloaded) return null;

  const { buffer, mimeType } = downloaded;
  const ext = getExtension(mimeType);
  const mediaType = getMediaCategory(mimeType);
  const fileName = `${businessId}/${Date.now()}-${mediaId}.${ext}`;

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from("whatsapp-media")
    .upload(fileName, buffer, { contentType: mimeType, upsert: false });

  if (error) {
    console.error("Storage upload error:", error.message);
    return null;
  }

  const { data } = supabase.storage.from("whatsapp-media").getPublicUrl(fileName);
  return { publicUrl: data.publicUrl, mediaType, buffer, mimeType };
}
