// Sends the real request payloads to stripe-mock (Stripe's local API fake,
// which validates parameters against Stripe's OpenAPI spec). Skipped unless
// STRIPE_MOCK_PORT is set — CI doesn't run stripe-mock.
import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { checkoutSessionParams } from "./checkout";

const port = process.env.STRIPE_MOCK_PORT;

describe.skipIf(!port)("Stripe API payloads (stripe-mock)", () => {
  const stripe = new Stripe("sk_test_123", { host: "localhost", port: Number(port), protocol: "http" });

  it("Checkout session for Buy Now is accepted", async () => {
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        item: { id: "item-1", name: "Oak rocking chair" },
        sale: { id: "sale-1", name: "BIG BIG Sale", slug: "big-big-sale" },
        orderId: "order-1",
        amountCents: 2500,
        feeCents: 103,
        code: "0421",
        destination: "acct_123",
        origin: "https://yardsaleqr.example.com",
        photoUrl: "https://example.com/p.jpg",
      })
    );
    expect(session.object).toBe("checkout.session");
  });

  it("seller onboarding, payouts link, and refunds are accepted", async () => {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: "seller@example.com",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_type: "individual",
      business_profile: { product_description: "Personal yard / garage sale items" },
      metadata: { user_id: "u1" },
    });
    expect(account.object).toBe("account");
    const link = await stripe.accountLinks.create({
      account: "acct_123",
      type: "account_onboarding",
      refresh_url: "https://x.com/api/stripe/connect",
      return_url: "https://x.com/api/stripe/connect/return",
    });
    expect(link.object).toBe("account_link");
    expect((await stripe.accounts.createLoginLink("acct_123")).object).toBe("login_link");
    const refund = await stripe.refunds.create(
      { payment_intent: "pi_123", reverse_transfer: true, refund_application_fee: true },
      { idempotencyKey: "refund-order-1" }
    );
    expect(refund.object).toBe("refund");
  });
});
