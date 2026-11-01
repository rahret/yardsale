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
        is: () => chain,
        select: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
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
    const { admin, rpc, updates } = fakeAdmin("paid");
    const { stripe, refundsCreate } = fakeStripe();
    expect(await handleStripeEvent(completed(), stripe, admin as never)).toBe("paid");
    expect(rpc).toHaveBeenCalledWith("complete_order", {
      p_order_id: "order-1",
      p_payment_intent: "pi_1",
      p_buyer_email: "buyer@example.com",
      p_buyer_name: "Sam",
    });
    expect(refundsCreate).not.toHaveBeenCalled();
    // and claims the seller's email alert for this order
    expect(updates.some((u) => u.table === "orders" && "seller_notified_at" in u.values)).toBe(true);
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

describe("handleStripeEvent — seller billing", () => {
  function fakeBillingAdmin(row: Record<string, unknown> | null = null) {
    const upserts: Record<string, unknown>[] = [];
    const rpc = vi.fn(async () => ({ data: "2026-11-29T00:00:00Z", error: null }));
    const admin = {
      rpc,
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          update: () => chain,
          maybeSingle: async () => ({ data: row, error: null }),
          upsert: async (values: Record<string, unknown>) => {
            upserts.push(values);
            return { error: null };
          },
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return chain;
      },
    };
    return { admin, rpc, upserts };
  }
  const subscription = (over: Record<string, unknown> = {}) => ({
    id: "sub_1",
    customer: "cus_1",
    status: "trialing",
    metadata: { user_id: "user-1" },
    current_period_end: 1793000000,
    cancel_at_period_end: false,
    trial_start: 1792400000,
    trial_end: 1793000000,
    items: { data: [{ price: { recurring: { interval: "month" } } }] },
    ...over,
  });
  const event = (type: string, object: unknown) => ({ id: "evt_b", type, data: { object } }) as unknown as Stripe.Event;

  it("grants a Sale Pass once paid, without touching orders", async () => {
    const { admin, rpc } = fakeBillingAdmin();
    const { stripe } = fakeStripe();
    const session = { id: "cs_pass", payment_status: "paid", amount_total: 1499, metadata: { kind: "sale_pass", user_id: "user-1" } };
    expect(await handleStripeEvent(event("checkout.session.completed", session), stripe, admin as never)).toBe(
      "sale pass granted"
    );
    expect(rpc).toHaveBeenCalledWith("grant_sale_pass", {
      p_user: "user-1",
      p_session: "cs_pass",
      p_amount_cents: 1499,
      p_days: 30,
    });
    expect(rpc).not.toHaveBeenCalledWith("complete_order", expect.anything());
  });

  it("ends the trial when a Sale Pass is bought from it", async () => {
    const { admin, upserts } = fakeBillingAdmin({ user_id: "user-1", plan: "pro", stripe_subscription_id: "sub_1" });
    const cancel = vi.fn(async () => subscription({ status: "canceled" }));
    const retrieve = vi.fn(async () => subscription());
    const stripe = { subscriptions: { retrieve, cancel } } as unknown as Stripe;
    const session = {
      id: "cs_pass2",
      customer: "cus_1",
      payment_status: "paid",
      amount_total: 1499,
      metadata: { kind: "sale_pass", user_id: "user-1", end_trial_subscription: "sub_1" },
    };
    expect(await handleStripeEvent(event("checkout.session.completed", session), stripe, admin as never)).toBe(
      "sale pass granted, trial ended"
    );
    expect(cancel).toHaveBeenCalledWith("sub_1");
    expect(upserts[0]).toMatchObject({ subscription_status: "canceled", plan: "none" });

    // the webhook and the return page both apply it; the second time the trial is already over
    retrieve.mockResolvedValueOnce(subscription({ status: "canceled" }));
    expect(await handleStripeEvent(event("checkout.session.completed", session), stripe, admin as never)).toBe(
      "sale pass granted"
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("ignores expired billing checkouts", async () => {
    const { admin, upserts } = fakeBillingAdmin();
    const { stripe } = fakeStripe();
    const session = { id: "cs_sub", metadata: { kind: "subscription", user_id: "user-1" } };
    expect(await handleStripeEvent(event("checkout.session.expired", session), stripe, admin as never)).toBe("ignored");
    expect(upserts).toEqual([]);
  });

  it("records subscription changes", async () => {
    const { admin, upserts } = fakeBillingAdmin({ user_id: "user-1", plan: "none" });
    const { stripe } = fakeStripe();
    expect(
      await handleStripeEvent(event("customer.subscription.created", subscription()), stripe, admin as never)
    ).toBe("subscription trialing");
    expect(upserts[0]).toMatchObject({
      user_id: "user-1",
      stripe_customer_id: "cus_1",
      plan: "pro",
      subscription_status: "trialing",
      trial_used: true,
    });
  });

  it("keeps complimentary accounts on their plan", async () => {
    const { admin, upserts } = fakeBillingAdmin({ user_id: "user-1", plan: "comp" });
    const { stripe } = fakeStripe();
    await handleStripeEvent(event("customer.subscription.deleted", subscription({ status: "canceled" })), stripe, admin as never);
    expect(upserts[0]).toMatchObject({ plan: "comp", subscription_status: "canceled" });
  });

  it("doesn't let an old subscription ending wipe out a newer one", async () => {
    const { admin, upserts } = fakeBillingAdmin({
      user_id: "user-1",
      plan: "pro",
      stripe_subscription_id: "sub_new",
      subscription_status: "active",
    });
    const { stripe } = fakeStripe();
    expect(
      await handleStripeEvent(
        event("customer.subscription.deleted", subscription({ id: "sub_old", status: "canceled" })),
        stripe,
        admin as never
      )
    ).toBe("stale subscription ignored");
    expect(upserts).toEqual([]);
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
