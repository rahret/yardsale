import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { handleStripeEvent } from "./stripeEvents";

// A tiny stand-in for the Supabase admin client that records calls.
function fakeAdmin(rpcResult: string) {
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
  const admin = {
    rpc,
    from: (table: string) => {
      const chain = {
        update: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return chain;
        },
        eq: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  };
  return { admin, rpc, updates };
}

function fakeStripe() {
  const refundsCreate = vi.fn(async () => ({ id: "re_1" }));
  return { stripe: { refunds: { create: refundsCreate } } as unknown as Stripe, refundsCreate };
}

const completed = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        payment_status: "paid",
        payment_intent: "pi_1",
        metadata: { order_id: "order-1" },
        client_reference_id: "order-1",
        customer_details: { email: "buyer@example.com", name: "Card Name" },
        custom_fields: [{ key: "pickup_name", text: { value: "Sam" } }],
        ...over,
      },
    },
  }) as unknown as Stripe.Event;

describe("handleStripeEvent", () => {
  it("completes a paid checkout with the pickup name and email", async () => {
    const { admin, rpc } = fakeAdmin("paid");
    const { stripe, refundsCreate } = fakeStripe();
    expect(await handleStripeEvent(completed(), stripe, admin as never)).toBe("paid");
    expect(rpc).toHaveBeenCalledWith("complete_order", {
      p_order_id: "order-1",
      p_payment_intent: "pi_1",
      p_buyer_email: "buyer@example.com",
      p_buyer_name: "Sam",
    });
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("refunds automatically when someone else got the item first", async () => {
    const { admin, updates } = fakeAdmin("conflict");
    const { stripe, refundsCreate } = fakeStripe();
    expect(await handleStripeEvent(completed(), stripe, admin as never)).toMatch(/refunded/);
    expect(refundsCreate).toHaveBeenCalledWith(
      { payment_intent: "pi_1", reverse_transfer: true, refund_application_fee: true },
      { idempotencyKey: "refund-order-1" }
    );
    expect(updates.some((u) => u.table === "orders" && u.values.status === "refunded")).toBe(true);
  });

  it("waits on delayed payment methods instead of selling early", async () => {
    const { admin, rpc } = fakeAdmin("paid");
    const { stripe } = fakeStripe();
    expect(await handleStripeEvent(completed({ payment_status: "unpaid" }), stripe, admin as never)).toBe(
      "awaiting payment"
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marks abandoned checkouts expired", async () => {
    const { admin, updates } = fakeAdmin("paid");
    const { stripe } = fakeStripe();
    const event = { ...completed(), type: "checkout.session.expired" } as Stripe.Event;
    expect(await handleStripeEvent(event, stripe, admin as never)).toBe("expired");
    expect(updates).toEqual([{ table: "orders", values: { status: "expired" } }]);
  });
});

describe("webhook signatures", () => {
  // the same check the webhook route runs on every request
  const stripe = new Stripe("sk_test_dummy");
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: {} } });

  it("accepts events signed with our secret", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_1");
  });

  it("rejects forged or tampered events", () => {
    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_attacker" });
    expect(() => stripe.webhooks.constructEvent(payload, forged, secret)).toThrow();
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => stripe.webhooks.constructEvent(payload.replace("evt_1", "evt_2"), header, secret)).toThrow();
  });
});
