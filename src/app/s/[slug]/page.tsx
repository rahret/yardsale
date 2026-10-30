import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ShopView from "@/components/ShopView";
import SiteHeader from "@/components/SiteHeader";
import { isSignedIn } from "@/lib/currentUser";
import { loadPublicSale, previewVersion, requestOrigin } from "@/lib/saleData";
import { itemPreview, salePreview } from "@/lib/share";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams: { item?: string } };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const data = await loadPublicSale(params.slug);
  if (!data || data.sale.status === "draft") {
    return { title: "Yard Sale QR", robots: { index: false } };
  }

  const origin = requestOrigin();
  const item = searchParams.item ? data.items.find((i) => i.id === searchParams.item) : undefined;
  const { title, description } = item
    ? itemPreview(data.sale, data.days, item)
    : salePreview(data.sale, data.days, data.items);

  const image = new URL(`${origin}/s/${params.slug}/preview`);
  image.searchParams.set("v", previewVersion(data));
  if (item) image.searchParams.set("item", item.id);
  const url = item ? `${origin}/s/${params.slug}?item=${item.id}` : `${origin}/s/${params.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Yard Sale QR",
      title,
      description,
      url,
      images: [{ url: image.toString(), width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.toString()] },
  };
}

export default async function PublicSalePage({ params, searchParams }: Props) {
  const [found, signedIn] = await Promise.all([loadPublicSale(params.slug), isSignedIn()]);

  if (!found) {
    return (
      <>
        <SiteHeader signedIn={signedIn} />
        <div className="min-h-[70vh] flex items-center justify-center px-4 text-center">
          <div>
            <div className="font-marker text-3xl text-marker mb-2">Sale not found</div>
            <p className="opacity-70 text-sm">
              This link doesn&apos;t match any garage sale. Double-check the URL or QR code.
            </p>
          </div>
        </div>
      </>
    );
  }

  // sweep any stale reservations so the page is accurate on first load; the
  // cached items above may predate the sweep, so refetch if anything expired
  const supabase = createClient();
  await supabase.rpc("sweep_expired_reservations", { p_sale_id: found.sale.id });
  const [{ data: items }, { data: access }] = await Promise.all([
    supabase
      .from("items")
      .select("*, item_photos(*)")
      .eq("sale_id", found.sale.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("seller_access", { p_user: found.sale.owner_id }),
  ]);

  return (
    <>
      <SiteHeader signedIn={signedIn} />
      <ShopView
        sale={found.sale}
        initialItems={items || found.items}
        saleDays={found.days}
        initialItemId={searchParams.item}
        holdsAndBuyNow={access === "full"}
      />
    </>
  );
}
