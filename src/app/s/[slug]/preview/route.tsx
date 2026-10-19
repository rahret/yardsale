import type { NextRequest } from "next/server";
import { loadPublicSale } from "@/lib/saleData";
import { renderPreviewImage } from "@/lib/previewImage";

// Link-preview image for a sale (?item=<id> for one item, ?size=square for
// the 1080×1080 download, ?download=1 to save it as a file).
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const data = await loadPublicSale(params.slug);
  if (!data || data.sale.status === "draft") return new Response("Not found", { status: 404 });

  const search = request.nextUrl.searchParams;
  const square = search.get("size") === "square";
  const item = search.get("item") ? data.items.find((i) => i.id === search.get("item")) : undefined;
  const image = await renderPreviewImage(data, { square, item });

  const headers = new Headers(image.headers);
  // The URL carries a version (?v=) that changes with the sale, so it's safe to cache.
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  if (search.get("download")) {
    headers.set("Content-Disposition", `attachment; filename="${params.slug}${item ? "-item" : ""}${square ? "-square" : ""}.png"`);
  }
  return new Response(image.body, { status: image.status, headers });
}
