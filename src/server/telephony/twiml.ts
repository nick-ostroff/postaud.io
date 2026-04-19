/**
 * TwiML builders. Keep string templating narrow; Twilio's helper SDK can
 * be swapped in later for complex cases.
 */

/**
 * Default TTS voice for <Say>. Amazon Polly generative voices sound
 * dramatically more natural than the classic neural voices.
 */
export const VOICE = "Polly.Ruth-Generative";

export function twimlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export function hangupWithMessage(message: string): Response {
  return twimlResponse(`<Say voice="${VOICE}">${message}</Say><Hangup/>`);
}
