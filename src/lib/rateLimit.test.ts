import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
import { allow, clientIp, hashKey } from "./rateLimit";

describe("allow", () => {
  it("asks the database with a hashed key and follows its answer", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    expect(await allow("checkout", "203.0.113.9", { rpc } as never)).toBe(false);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("rate_limit_hit");
    expect(args).toEqual({ p_key: `checkout:${hashKey("203.0.113.9")}`, p_limit: 15, p_window_seconds: 3600 });
    expect(String(args.p_key)).not.toContain("203.0.113.9");
  });

  it("lets requests through if the limiter is unavailable", async () => {
    expect(await allow("geocode", "x", null)).toBe(true);
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    expect(await allow("geocode", "x", { rpc } as never)).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the headers Vercel sets", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
