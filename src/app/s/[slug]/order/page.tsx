import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { fulfillCheckoutSession } from "@/lib/stripeEvents";
import { money } from "@/lib/utils";
import type { Order } from "@/lib/types";
import AutoRefresh from "@/components/AutoRefresh";
import SiteHeader from "@/components/SiteHeader";
import { isSignedIn } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Where Stripe Checkout sends the buyer after paying: shows the pickup code.
// The Checkout session id in the URL is the buyer's proof of purchase.
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { session_id?: string };
}) {
  const admin = createAdminClient();
  const stripe = getStripe();
  const sessionId = searchParams.session_id;
  let order: Order | null = null;

  if (admin && sessionId) {
    const load = async () =>
      (await admin.from("orders").select("*").eq("stripe_checkout_session_id", sessionId).maybeSingle()).data as Order | null;
    order = await load();
    // don't wait on the webhook: if Stripe says it's paid, finish it now
    if (order?.status === "pending" && stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          await fulfillCheckoutSession(session, stripe, admin);
          order = await load();
        }
      } catch {
        // fall back to the webhook + auto-refresh below
      }
    }
  }

  const back = (
    <Link href={`/s/${params.slug}`} className="inline-block mt-6 text-grass-dark font-semibold underline text-sm">
      ← Back to the sale
    </Link>
  );

  return (
    <>
      <SiteHeader signedIn={await isSignedIn()} />
      <div className="min-h-[70vh] flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-sm bg-white border-2 border-cardboard-dark rounded-2xl p-7 shadow-tag text-center">
          {!order ? (
            <>
              <div className="font-marker text-2xl text-marker mb-2">Order not found</div>
              <p className="text-sm opacity-75">We couldn&apos;t find this purchase. If you were charged, check your email receipt.</p>
              {back}
            </>
          ) : order.status === "paid" || order.status === "picked_up" ? (
            <>
              <div className="text-4xl mb-1">🎉</div>
              <div className="font-marker text-2xl text-marker mb-1">It&apos;s yours!</div>
              <p className="text-sm opacity-75">
                You bought <strong>{order.item_name}</strong> for {money(order.amount_cents / 100)}.
              </p>
              <div className="my-5">
                <div className="text-[11px] uppercase tracking-wide font-bold opacity-60">Pickup code</div>
                <div className="font-mono text-5xl font-bold tracking-[0.2em]">{order.pickup_code}</div>
              </div>
              <p className="text-sm opacity-75">
                Show this code to the seller when you pick it up at the sale. It&apos;s also on your emailed receipt.
              </p>
              {back}
            </>
          ) : order.status === "refunded" || order.status === "conflict" ? (
            <>
              <div className="font-marker text-2xl text-marker mb-2">Sorry — someone beat you to it</div>
              <p className="text-sm opacity-75">
                {order.item_name} sold just before your payment went through, so you&apos;ve been refunded in full. It
                can take a few days to show up.
              </p>
              {back}
            </>
          ) : order.status === "expired" ? (
            <>
              <div className="font-marker text-2xl text-marker mb-2">Checkout didn&apos;t finish</div>
              <p className="text-sm opacity-75">You weren&apos;t charged. You can try again from the sale page.</p>
              {back}
            </>
          ) : (
            <>
              <div className="font-marker text-2xl text-marker mb-2">Confirming your payment…</div>
              <p className="text-sm opacity-75">This usually takes a few seconds.</p>
              <AutoRefresh seconds={3} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
