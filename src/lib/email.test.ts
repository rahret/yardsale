import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email";
import { escapeHtml, holdPlacedEmail, orderPaidEmail } from "./alertEmails";

const ok = () => Promise.resolve(new Response(JSON.stringify({ data: [{ code: "EM_104" }] }), { status: 201 }));

describe("sendEmail (ZeptoMail)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const email = { to: "seller@example.com", toName: "Jamie", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

  it("posts to ZeptoMail with the token and from address", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc123");
    vi.stubEnv("ALERT_FROM_EMAIL", "alerts@rahretinnovationlabs.com");
    const f = vi.fn(ok);
    expect(await sendEmail({ ...email, replyTo: "buyer@example.com" }, f as never)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.zeptomail.com/v1.1/email");
    expect((init.headers as Record<string, string>).Authorization).toBe("Zoho-enczapikey abc123");
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: { address: "alerts@rahretinnovationlabs.com", name: "Yard Sale QR" },
      to: [{ email_address: { address: "seller@example.com", name: "Jamie" } }],
      reply_to: [{ address: "buyer@example.com" }],
      subject: "Hi",
      htmlbody: "<p>Hi</p>",
      textbody: "Hi",
    });
  });

  it("accepts the token pasted with its prefix", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "Zoho-enczapikey abc123");
    vi.stubEnv("ALERT_FROM_EMAIL", "alerts@rahretinnovationlabs.com");
    const f = vi.fn(ok);
    await sendEmail(email, f as never);
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe(
      "Zoho-enczapikey abc123"
    );
  });

  it("reports false (never throws) when not set up or ZeptoMail refuses", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ZEPTOMAIL_TOKEN", "");
    expect(await sendEmail(email, vi.fn(ok) as never)).toBe(false);
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc123");
    vi.stubEnv("ALERT_FROM_EMAIL", "alerts@rahretinnovationlabs.com");
    expect(await sendEmail(email, vi.fn(() => Promise.resolve(new Response("bad", { status: 401 }))) as never)).toBe(false);
    expect(await sendEmail(email, vi.fn(() => Promise.reject(new Error("down"))) as never)).toBe(false);
  });
});

describe("alert emails", () => {
  it("tells the seller what sold, what they receive and the pickup code", () => {
    const e = orderPaidEmail({
      saleName: "Big Sale",
      itemName: "Oak rocking chair",
      amountCents: 2500,
      feeCents: 156,
      pickupCode: "0421",
      buyerName: "Sam",
      buyerEmail: "sam@example.com",
      link: "https://x.test/dashboard/sales/1#orders",
    });
    expect(e.subject).toBe("💳 Sold online: Oak rocking chair — $25");
    expect(e.text).toContain("You receive: $23.44");
    expect(e.text).toContain("Pickup code: 0421");
    expect(e.html).toContain('href="https://x.test/dashboard/sales/1#orders"');
  });

  it("tells the seller who's holding what, their phone and until when", () => {
    const e = holdPlacedEmail({
      saleName: "Big Sale",
      itemName: "Lamp",
      price: 15,
      buyerName: "Pat",
      buyerPhone: "5155550142",
      holdUntil: "2:30 PM",
      link: "https://x.test/dashboard/sales/1#items",
    });
    expect(e.subject).toBe("✋ Hold: Lamp for Pat");
    expect(e.text).toContain("Phone: (515) 555-0142");
    expect(e.text).toContain("Held until: 2:30 PM");
  });

  it("escapes anything people typed", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    const e = holdPlacedEmail({
      saleName: "Sale",
      itemName: "<img src=x onerror=alert(1)>",
      price: 1,
      buyerName: "<script>",
      buyerPhone: "5155550142",
      holdUntil: "1 PM",
      link: "https://x.test",
    });
    expect(e.html).not.toContain("<img");
    expect(e.html).not.toContain("<script>");
  });
});
