import { openai } from "./clients";
import { env } from "@/lib/env";

/**
 * Downloads a Twilio recording (basic auth required) and pipes it through
 * Whisper. Returns the raw transcript text.
 */
export async function transcribeRecording(recordingUrl: string): Promise<string> {
  const sid = env().TWILIO_ACCOUNT_SID;
  const token = env().TWILIO_AUTH_TOKEN;
  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(recordingUrl, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch recording ${recordingUrl}: HTTP ${res.status}`);
  }
  const arr = await res.arrayBuffer();
  const file = new File([arr], "recording.mp3", { type: "audio/mpeg" });

  const t = await openai().audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "text",
  });
  // `text` response_format returns a string directly.
  return typeof t === "string" ? t : (t as { text: string }).text;
}
