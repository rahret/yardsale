import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn(async () => true);
vi.mock("./email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
import { notifyHoldPlaced, notifyOrderPaid } from "./alerts";

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
