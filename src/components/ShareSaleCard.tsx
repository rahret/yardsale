"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Item, Sale, SaleDay } from "@/lib/types";
import ShareButton from "@/components/ShareButton";
import {
  POST_KINDS,
  SOURCE_LABELS,
  type PostKind,
  publicLocation,
  saleLink,
  salePost,
  siteOriginForClient,
} from "@/lib/share";

type Days = Pick<SaleDay, "date" | "start_time" | "end_time">[];

/** Seller-side sharing tools: one-tap share, ready-to-paste posts, a square
 * image for stories, the address-privacy setting, and visit counts by source. */
export default function ShareSaleCard({
  sale,
  items,
  days,
  onSaleChange,
}: {
  sale: Sale;
  items: Item[];
  days: Days;
  onSaleChange: (sale: Sale) => void;
}) {
  const origin = siteOriginForClient();
  const [postKind, setPostKind] = useState<PostKind>("group");
  const [copied, setCopied] = useState("");
  const [visits, setVisits] = useState<{ src: string; visits: number }[] | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const isDraft = sale.status === "draft";

  const post = useMemo(() => {
    const kind = POST_KINDS.find((k) => k.kind === postKind)!;
    // salePost only reads date/start_time/end_time from each day
    return salePost(postKind, sale, days as SaleDay[], items, saleLink(origin, sale.slug, { src: kind.src }));
  }, [postKind, sale, days, items, origin]);

  useEffect(() => {
    createClient()
      .rpc("sale_visit_counts", { p_sale_id: sale.id })
      .then(({ data }) => setVisits((data as { src: string; visits: number }[] | null) || []));
  }, [sale.id]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  async function toggleListed(listed: boolean) {
    setSavingAddress(true);
    const { data, error } = await createClient().from("sales").update({ listed }).eq("id", sale.id).select().single();
    setSavingAddress(false);
    if (!error && data) onSaleChange(data);
  }

  async function toggleFullAddress(show: boolean) {
    setSavingAddress(true);
    const { data, error } = await createClient()
      .from("sales")
      .update({ show_full_address: show })
      .eq("id", sale.id)
      .select()
      .single();
    setSavingAddress(false);
    if (!error && data) onSaleChange(data);
  }

  const totalVisits = (visits || []).reduce((n, v) => n + Number(v.visits), 0);
  const btn = "border-2 border-cardboard-dark bg-white font-bold px-3 py-1.5 rounded-lg text-xs";

  return (
    <div className="border-t-2 border-dashed border-cardboard/60 mt-4 pt-4">
      {isDraft && (
        <div className="text-xs font-semibold bg-sun/30 border border-sun rounded-lg px-3 py-2 mb-3">
          Your sale is still a draft — set it to <strong>Live</strong> before sharing, or people will see
          &ldquo;not published yet&rdquo;.
        </div>
      )}

      <div className="text-xs font-bold opacity-70 mb-1.5">Share the link</div>
      <div className="flex gap-2 flex-wrap mb-4">
        <ShareButton
          url={saleLink(origin, sale.slug, { src: "share" })}
          title={sale.name}
          text={`Yard sale: ${sale.name}`}
          label="↗ Share…"
          className="bg-grass text-white font-bold px-3 py-1.5 rounded-lg text-xs"
        />
        <a
          className={btn}
          target="_blank"
          rel="noopener noreferrer"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(saleLink(origin, sale.slug, { src: "facebook" }))}`}
        >
          Facebook
        </a>
        <a
          className={btn}
          href={`mailto:?subject=${encodeURIComponent(`Yard sale: ${sale.name}`)}&body=${encodeURIComponent(
            salePost("text", sale, days as SaleDay[], items, saleLink(origin, sale.slug, { src: "email" }))
          )}`}
        >
          Email
        </a>
        <a
          className={btn}
          href={`sms:?&body=${encodeURIComponent(
            salePost("text", sale, days as SaleDay[], items, saleLink(origin, sale.slug, { src: "text" }))
          )}`}
        >
          Text
        </a>
      </div>

      <div className="text-xs font-bold opacity-70 mb-1.5">Ready-to-paste posts</div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {POST_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => setPostKind(k.kind)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
              postKind === k.kind ? "bg-ink text-chalk border-ink" : "border-cardboard-dark bg-white"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <textarea
        readOnly
        value={post}
        rows={postKind === "text" ? 4 : 12}
        className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm bg-chalk"
      />
      <div className="flex items-center gap-2 mt-1.5 mb-4">
        <button type="button" onClick={() => copy(post, "post")} className="bg-ink text-chalk font-bold px-4 py-2 rounded-lg text-sm">
          Copy post
        </button>
        {copied === "post" && <span className="text-grass-dark text-xs font-semibold">Copied!</span>}
      </div>

      <div className="text-xs font-bold opacity-70 mb-1.5">Image for Instagram / Facebook stories</div>
      <div className="mb-4">
        {isDraft ? (
          <span className="text-xs opacity-60">Available once the sale is live.</span>
        ) : (
          <a
            className={btn + " inline-block"}
            href={`/s/${sale.slug}/preview?size=square&download=1&v=${Date.now().toString(36)}`}
          >
            ⬇ Download square image
          </a>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm mb-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={sale.listed}
          disabled={savingAddress}
          onChange={(e) => toggleListed(e.target.checked)}
        />
        <span>
          List my sale in <strong>Find yard sales</strong> on the home page
          <span className="block text-xs opacity-60">
            Buyers searching your area can find it while it&apos;s Live. Listings show the street name, not your house
            number.
          </span>
          {sale.listed && sale.street?.trim() && sale.lat == null && (
            <span className="block text-xs font-semibold text-amber mt-0.5">
              We couldn&apos;t place your address on the map yet, so distance searches won&apos;t find it. Check the
              address in Sale details and save again.
            </span>
          )}
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm mb-1">
        <input
          type="checkbox"
          className="mt-1"
          checked={sale.show_full_address}
          disabled={savingAddress}
          onChange={(e) => toggleFullAddress(e.target.checked)}
        />
        <span>
          Show my full address in link previews and posts
          <span className="block text-xs opacity-60">
            {publicLocation(sale)
              ? `Previews and posts will show: ${publicLocation(sale)}`
              : "Add your address in Sale details below."}{" "}
            Your sale page always shows the full address.
          </span>
        </span>
      </label>

      <div className="border-t-2 border-dashed border-cardboard/60 mt-4 pt-3">
        <div className="text-xs font-bold opacity-70 mb-1.5">
          Visits {visits && totalVisits > 0 ? `(${totalVisits})` : ""}
        </div>
        {visits === null ? (
          <div className="text-xs opacity-60">Loading…</div>
        ) : totalVisits === 0 ? (
          <div className="text-xs opacity-60">No visits yet. Your own visits aren&apos;t counted.</div>
        ) : (
          <ul className="text-xs space-y-0.5">
            {[...visits]
              .sort((a, b) => Number(b.visits) - Number(a.visits))
              .map((v) => (
                <li key={v.src} className="flex justify-between max-w-xs">
                  <span>{SOURCE_LABELS[v.src] || v.src}</span>
                  <span className="font-mono font-bold">{v.visits}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
