/**
 * TwiML builders. Keep string templating narrow; Twilio's helper SDK can
 * be swapped in later for complex cases.
 */

export function twimlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export function gatherDialCode(actionUrl: string): Response {
  return twimlResponse(`
    <Pause length="1"/>
    <Gather numDigits="6" timeout="5" action="${actionUrl}" method="POST"/>
    <Say voice="Polly.Joanna-Neural">I didn't catch your code. Please say or enter the six digit code from your text.</Say>
    <Gather input="speech dtmf" numDigits="6" speechTimeout="4" action="${actionUrl}" method="POST"/>
    <Say>I couldn't match you to an interview. Please tap the link in your text again.</Say>
    <Hangup/>
  `);
}

export function connectConversationRelay(opts: {
  wsUrl: string;
  welcome: string;
  recordingCallbackUrl: string;
}): Response {
  const welcomeEscaped = opts.welcome.replace(/"/g, "&quot;");
  return twimlResponse(`
    <Connect>
      <ConversationRelay
        url="${opts.wsUrl}"
        voice="en-US-Neural2-F"
        welcomeGreeting="${welcomeEscaped}"
        transcriptionProvider="google"
        recordingEnabled="true"
        recordingStatusCallback="${opts.recordingCallbackUrl}"
      />
    </Connect>
  `);
}

export function hangupWithMessage(message: string): Response {
  return twimlResponse(`<Say>${message}</Say><Hangup/>`);
}
