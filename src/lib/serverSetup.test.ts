import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { serverSetup } from "./serverSetup";

describe("serverSetup", () => {
  it("names what's missing", () => {
    expect(serverSetup({ STRIPE_SECRET_KEY: "sk_test_x", ZEPTOMAIL_TOKEN: " " })).toEqual({
      paymentsMissing: ["SUPABASE_SERVICE_ROLE_KEY"],
      emailMissing: ["SUPABASE_SERVICE_ROLE_KEY", "ZEPTOMAIL_TOKEN", "ALERT_FROM_EMAIL"],
    });
  });
  it("is empty when everything is set", () => {
    expect(
      serverSetup({ STRIPE_SECRET_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "b", ZEPTOMAIL_TOKEN: "c", ALERT_FROM_EMAIL: "d" })
    ).toEqual({ paymentsMissing: [], emailMissing: [] });
  });
});
