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

export type SendResult = { ok: true } | { ok: false; reason: string };

export async function sendEmail(email: Email, f: Fetch = fetch): Promise<boolean> {
  return (await sendEmailDetailed(email, f)).ok;
}

/** Like sendEmail, but says why a send failed (for the seller's "send a test
 * email" button). The reason never includes the token. */
export async function sendEmailDetailed(email: Email, f: Fetch = fetch): Promise<SendResult> {
  const token = process.env.ZEPTOMAIL_TOKEN?.trim();
  const from = process.env.ALERT_FROM_EMAIL?.trim();
  if (!token || !from) {
    const missing = [!token && "ZEPTOMAIL_TOKEN", !from && "ALERT_FROM_EMAIL"].filter(Boolean).join(" and ");
    console.warn(`Email not sent (${missing} not set):`, email.subject);
    return { ok: false, reason: `${missing} ${missing.includes(" and ") ? "aren't" : "isn't"} set on the server.` };
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
      const body = (await res.text().catch(() => "")).slice(0, 500);
      console.error("ZeptoMail send failed", res.status, body);
      return { ok: false, reason: `ZeptoMail refused it (HTTP ${res.status}): ${zeptoMessage(body)}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("ZeptoMail send failed", e);
    return { ok: false, reason: "Couldn't reach ZeptoMail." };
  }
}

/** The readable part of a ZeptoMail error response. */
export function zeptoMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    const details = (j?.error?.details || []).map((d: { message?: string }) => d?.message).filter(Boolean);
    return [j?.error?.message, ...details].filter(Boolean).join(" — ") || body.slice(0, 200);
  } catch {
    return body.slice(0, 200) || "no details";
  }
}
