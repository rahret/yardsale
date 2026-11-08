import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn(async () => true);
vi.mock("./email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
import { notifyBuyerHoldPlaced, notifyBuyerOrderPaid, notifyHoldPlaced, notifyOrderPaid } from "./alerts";

/** A stand-in for the Supabase admin client: tables are arrays of rows, and
 * update().eq()/is()/gte() filters behave like the real ones. */
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>, email = "seller@example.com") {
  const query = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let patch: Record<string, unknown> | null = null;
    const rows = () => (tables[table] || []).filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      update: (p: Record<string, unknown>) => {
        patch = p;
        return q;
      },
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
      not: (k: string, op: string, v: unknown) => (filters.push((r) => op !== "is" || (r[k] ?? null) !== v), q),
      gte: (k: string, v: string) => (filters.push((r) => String(r[k]) >= v), q),
      maybeSingle: async () => {
        const hit = rows()[0] || null;
        if (hit && patch) Object.assign(hit, patch);
        return { data: hit, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        const hits = rows();
        if (patch) hits.forEach((h) => Object.assign(h, patch));
        resolve({ data: hits, error: null });
      },
    };
    return q;
  };
  return {
    from: query,
    auth: { admin: { getUserById: async () => ({ data: { user: { email } } }) } },
  };
}

const NOW = Date.parse("2026-11-07T15:00:00Z");

describe("seller alerts", () => {
  beforeEach(() => sendEmail.mockClear());
  afterEach(() => sendEmail.mockResolvedValue(true));

  const base = () => ({
    sales: [{ id: "s1", name: "Big Sale", owner_id: "u1", timezone: "America/Chicago", default_reservation_minutes: 30 }],
    profiles: [{ id: "u1", display_name: "Jamie", email_alerts: true }],
    items: [{ id: "i1", name: "Lamp", price: 15, reservation_minutes: null }],
    orders: [
      { id: "o1", sale_id: "s1", status: "paid", item_name: "Chair", amount_cents: 2500, fee_cents: 156, pickup_code: "0421", buyer_name: "Sam", buyer_email: "sam@example.com", seller_notified_at: null },
    ],
    item_holds: [
      { item_id: "i1", sale_id: "s1", name: "Pat", phone: "5155550142", created_at: new Date(NOW - 60_000).toISOString(), seller_notified_at: null },
    ],
  });

  it("emails the seller about a paid order exactly once", async () => {
    const admin = fakeAdmin(base());
    expect(await notifyOrderPaid(admin as never, "o1")).toBe("seller notified");
    expect(await notifyOrderPaid(admin as never, "o1")).toBe("already notified");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "seller@example.com", replyTo: "sam@example.com", subject: expect.stringContaining("Chair") })
    );
  });

  it("tries again later if the email didn't go out", async () => {
    const admin = fakeAdmin(base());
    sendEmail.mockResolvedValueOnce(false);
    expect(await notifyOrderPaid(admin as never, "o1")).toBe("send failed");
    expect(await notifyOrderPaid(admin as never, "o1")).toBe("seller notified");
  });

  it("respects the seller turning alerts off", async () => {
    const t = base();
    t.profiles[0].email_alerts = false;
    expect(await notifyOrderPaid(fakeAdmin(t) as never, "o1")).toBe("alerts off");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails about a new hold once, with the time it's held until in the seller's time zone", async () => {
    const admin = fakeAdmin(base());
    expect(await notifyHoldPlaced(admin as never, "i1", NOW)).toBe("seller notified");
    expect(await notifyHoldPlaced(admin as never, "i1", NOW)).toBe("nothing to send");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // held at 8:59 AM Chicago time + 30 minutes
    expect((sendEmail.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain("Held until: 9:29 AM");
  });

  it("ignores old holds (the route can't be used to spam a seller)", async () => {
    const t = base();
    t.item_holds[0].created_at = new Date(NOW - 60 * 60_000).toISOString();
    expect(await notifyHoldPlaced(fakeAdmin(t) as never, "i1", NOW)).toBe("nothing to send");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("buyer confirmations", () => {
  beforeEach(() => sendEmail.mockClear());
  afterEach(() => sendEmail.mockResolvedValue(true));

  const base = () => ({
    sales: [
      {
        id: "s1", slug: "big-sale", name: "Big Sale", owner_id: "u1", timezone: "America/Chicago",
        default_reservation_minutes: 30, street: "12 Elm St", city: "Springfield", state: "IL", zip: "62701",
      },
    ],
    sale_days: [{ sale_id: "s1", date: "2099-05-02", start_time: "08:00", end_time: "14:00" }],
    items: [{ id: "i1", name: "Lamp", price: 15, reservation_minutes: null }],
    orders: [
      {
        id: "o1", sale_id: "s1", status: "paid", item_name: "Chair", amount_cents: 2500, fee_cents: 156,
        pickup_code: "0421", buyer_name: "Sam", buyer_email: "sam@example.com", buyer_notified_at: null,
        stripe_checkout_session_id: "cs_test_1",
      },
    ],
    item_holds: [
      {
        item_id: "i1", sale_id: "s1", name: "Pat", phone: "5155550142", email: "pat@example.com",
        created_at: new Date(NOW - 60_000).toISOString(), buyer_notified_at: null,
      },
    ],
  });
  const sent = (n = 0) => (sendEmail.mock.calls[n] as unknown as [{ to: string; subject: string; text: string }])[0];

  it("emails the buyer their pickup code, address and hours once", async () => {
    const admin = fakeAdmin(base());
    expect(await notifyBuyerOrderPaid(admin as never, "o1")).toBe("buyer notified");
    expect(await notifyBuyerOrderPaid(admin as never, "o1")).toBe("nothing to send");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const e = sent();
    expect(e.to).toBe("sam@example.com");
    expect(e.subject).toContain("0421");
    expect(e.text).toContain("Pickup code: 0421");
    expect(e.text).toContain("Where: 12 Elm St, Springfield, IL 62701");
    expect(e.text).toContain("When:");
    expect(e.text).toContain("/s/big-sale/order?session_id=cs_test_1");
  });

  it("skips a buyer with no email, and retries a failed send", async () => {
    const t = base();
    t.orders[0].buyer_email = null as never;
    expect(await notifyBuyerOrderPaid(fakeAdmin(t) as never, "o1")).toBe("nothing to send");
    const admin = fakeAdmin(base());
    sendEmail.mockResolvedValueOnce(false);
    expect(await notifyBuyerOrderPaid(admin as never, "o1")).toBe("send failed");
    expect(await notifyBuyerOrderPaid(admin as never, "o1")).toBe("buyer notified");
  });

  it("emails a hold confirmation once, with the time it's held until", async () => {
    const admin = fakeAdmin(base());
    expect(await notifyBuyerHoldPlaced(admin as never, "i1", NOW)).toBe("buyer notified");
    expect(await notifyBuyerHoldPlaced(admin as never, "i1", NOW)).toBe("nothing to send");
    const e = sent();
    expect(e.to).toBe("pat@example.com");
    expect(e.subject).toContain("until 9:29 AM");
    expect(e.text).toContain("Where: 12 Elm St");
    expect(e.text).toContain("/s/big-sale?item=i1");
  });

  it("doesn't email about holds without an email, or old holds", async () => {
    const t = base();
    t.item_holds[0].email = null as never;
    expect(await notifyBuyerHoldPlaced(fakeAdmin(t) as never, "i1", NOW)).toBe("nothing to send");
    const old = base();
    old.item_holds[0].created_at = new Date(NOW - 60 * 60_000).toISOString();
    expect(await notifyBuyerHoldPlaced(fakeAdmin(old) as never, "i1", NOW)).toBe("nothing to send");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
