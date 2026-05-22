import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

const twilioEnabled =
  accountSid && authToken && fromNumber &&
  accountSid.startsWith("AC") &&
  authToken.length > 10;

const whatsappEnabled = twilioEnabled && !!whatsappFrom;

export async function sendSms(
  to: string,
  message: string
): Promise<{ simulated: boolean; error?: string }> {
  if (!twilioEnabled) {
    console.log(`[SMS SIM] No Twilio credentials — To +91${to}: ${message}`);
    return { simulated: true };
  }

  try {
    const client = twilio(accountSid, authToken);
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: `+91${to}`,
    });
    console.log(`[SMS] Sent to +91${to} — SID: ${result.sid} Status: ${result.status}`);
    return { simulated: false };
  } catch (err: any) {
    console.error(`[SMS ERROR] Failed to send to +91${to}:`, err?.message || err);
    return { simulated: true, error: err?.message };
  }
}

export async function sendWhatsApp(
  to: string,
  message: string
): Promise<{ simulated: boolean; error?: string }> {
  if (!whatsappEnabled) {
    console.log(`[WA SIM] No WhatsApp config — To +91${to}: ${message.substring(0, 80)}...`);
    return { simulated: true };
  }

  try {
    const client = twilio(accountSid, authToken);
    const result = await client.messages.create({
      body: message,
      from: whatsappFrom,
      to: `whatsapp:+91${to}`,
    });
    console.log(`[WA] Sent to +91${to} — SID: ${result.sid}`);
    return { simulated: false };
  } catch (err: any) {
    console.error(`[WA ERROR] Failed to send to +91${to}:`, err?.message || err);
    return { simulated: true, error: err?.message };
  }
}

export async function sendWhatsAppMedia(
  to: string,
  message: string,
  mediaUrl: string
): Promise<{ simulated: boolean; error?: string }> {
  if (!whatsappEnabled) {
    console.log(`[WA SIM] Media to +91${to}: ${message.substring(0, 60)}... [${mediaUrl}]`);
    return { simulated: true };
  }

  try {
    const client = twilio(accountSid, authToken);
    const result = await client.messages.create({
      body: message,
      from: whatsappFrom,
      to: `whatsapp:+91${to}`,
      mediaUrl: [mediaUrl],
    });
    console.log(`[WA] Media sent to +91${to} — SID: ${result.sid}`);
    return { simulated: false };
  } catch (err: any) {
    console.error(`[WA ERROR] Media failed for +91${to}:`, err?.message || err);
    return { simulated: true, error: err?.message };
  }
}
