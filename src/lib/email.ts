import "server-only";

/** Sending email through ZeptoMail (Zoho's service for app email).
 *
 * Needs ZEPTOMAIL_TOKEN (a Mail Agent's "Send Mail token") and
 * ALERT_FROM_EMAIL (an address on a domain verified in ZeptoMail). Optional:
 * ALERT_FROM_NAME, and ZEPTOMAIL_API_URL for an account outside the US data
 * centre (e.g. https://api.zeptomail.eu/v1.1/email).
 *
 * Never throws: a missing setup or a failed send is logged and reported as
 * false, so an email problem can't break a payment or a hold. */

export interface Email {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

type Fetch = typeof fetch;

export function emailConfigured(): boolean {
  return !!process.env.ZEPTOMAIL_TOKEN && !!process.env.ALERT_FROM_EMAIL;
}

export async function sendEmail(email: Email, f: Fetch = fetch): Promise<boolean> {
  const token = process.env.ZEPTOMAIL_TOKEN?.trim();
  const from = process.env.ALERT_FROM_EMAIL?.trim();
  if (!token || !from) {
    console.warn("Email not sent (ZEPTOMAIL_TOKEN / ALERT_FROM_EMAIL not set):", email.subject);
    return false;
  }
  try {
    const res = await f(process.env.ZEPTOMAIL_API_URL || "https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // ZeptoMail shows the token with its scheme; accept it either way
        Authorization: /^Zoho-enczapikey /i.test(token) ? token : `Zoho-enczapikey ${token}`,
      },
      body: JSON.stringify({
        from: { address: from, name: process.env.ALERT_FROM_NAME || "Yard Sale QR" },
        to: [{ email_address: { address: email.to, ...(email.toName ? { name: email.toName } : {}) } }],
        ...(email.replyTo ? { reply_to: [{ address: email.replyTo }] } : {}),
        subject: email.subject,
        htmlbody: email.html,
        textbody: email.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("ZeptoMail send failed", res.status, (await res.text().catch(() => "")).slice(0, 500));
      return false;
    }
    return true;
  } catch (e) {
    console.error("ZeptoMail send failed", e);
    return false;
  }
}
