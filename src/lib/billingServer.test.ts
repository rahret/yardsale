import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { ensureProduct } from "./billingServer";

const stripeError = (code: string) => Object.assign(new Error(code), { code });

function fakeStripe(retrieve: () => Promise<unknown>, create = vi.fn(async (p: { id: string }) => ({ id: p.id }))) {
  return { stripe: { products: { retrieve: vi.fn(retrieve), create } } as unknown as Stripe, create };
}

describe("ensureProduct", () => {
  it("reuses the plan's product once it exists", async () => {
    const { stripe, create } = fakeStripe(async () => ({ id: "yardsaleqr_pro_year" }));
    expect(await ensureProduct(stripe, "year")).toBe("yardsaleqr_pro_year");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates it the first time, with a fixed id", async () => {
    const { stripe, create } = fakeStripe(async () => {
      throw stripeError("resource_missing");
    });
    expect(await ensureProduct(stripe, "pass")).toBe("yardsaleqr_sale_pass");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "yardsaleqr_sale_pass", name: expect.stringContaining("Sale Pass") }));
  });

  it("copes with two checkouts creating it at once", async () => {
    const { stripe } = fakeStripe(
      async () => {
        throw stripeError("resource_missing");
      },
      vi.fn(async () => {
        throw stripeError("resource_already_exists");
      })
    );
    expect(await ensureProduct(stripe, "month")).toBe("yardsaleqr_pro_month");
  });

  it("doesn't hide other Stripe errors", async () => {
    const { stripe } = fakeStripe(async () => {
      throw stripeError("api_key_expired");
    });
    await expect(ensureProduct(stripe, "month")).rejects.toThrow("api_key_expired");
  });
});
