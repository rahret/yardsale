import type { NextRequest } from "next/server";
import { loadPublicSale, requestOrigin } from "@/lib/saleData";
import { saleCalendar } from "@/lib/saleInfo";

// "Add to calendar": an .ics file for the sale's remaining days. Served from
// the server (not built in the browser) so iPhones offer "Add to Calendar"
// instead of saving a file.
export async function GET(_request: NextRequest, { params: paramsIn }: { params: Promise<{ slug: string }> }) {
  const params = await paramsIn;
  const data = await loadPublicSale(params.slug);
  if (!data || data.sale.status === "draft") return new Response("Not found", { status: 404 });

  const ics = saleCalendar(data.sale, data.days, `${(await requestOrigin())}/s/${params.slug}`);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${params.slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
