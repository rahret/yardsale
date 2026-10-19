import { ImageResponse } from "next/og";
import sharp from "sharp";
import { currentDays, dayLines, forSaleItems, publicLocation, publicPhotoUrl, salePhase, topCategories } from "@/lib/share";
import type { Item } from "@/lib/types";
import type { PublicSale } from "@/lib/saleData";
import { money } from "@/lib/utils";

// Draws the image shown in link previews (1200×630), and a square version
// (1080×1080) sellers can download for stories/posts. Pass an item to draw a
// single item instead of the whole sale.

const INK = "#33312E";
const CHALK = "#FBF8F2";
const CARDBOARD = "#D4B896";
const CARDBOARD_DARK = "#B3915F";
const MARKER = "#C63F3F";
const GRASS_DARK = "#436942";

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: "normal" };

/** Fetches a Google Font subset containing just `text`. Returns null on any
 * failure so the image still renders with the default font. */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`
      )
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function firstPhoto(item: Item): string | null {
  const p = [...(item.item_photos || [])].sort((a, b) => a.position - b.position)[0];
  return p ? publicPhotoUrl(p.storage_path) : null;
}

/** Downloads a photo and returns it upright and shrunk, as a data URL.
 * Phone cameras save pixels sideways plus an EXIF "rotate me" flag; browsers
 * honor the flag but the preview renderer doesn't, so photos came out turned
 * 90°. sharp's rotate() (no angle) applies the flag. Falls back to the
 * original URL if anything goes wrong. */
async function uprightPhoto(url: string, maxSide: number): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return url;
  }
}

export async function renderPreviewImage(
  { sale, items, days }: PublicSale,
  { square = false, item }: { square?: boolean; item?: Item } = {}
): Promise<ImageResponse> {
  const width = square ? 1080 : 1200;
  const height = square ? 1080 : 630;

  const phase = salePhase(sale, days);
  const lines = dayLines(currentDays(sale, days)).slice(0, 3);
  const location = publicLocation(sale);
  const cats = topCategories(items, square ? 4 : 3);
  const count = forSaleItems(items).length;

  // Photos: the item's own, or up to 4 unsold items that have photos.
  const photos = item
    ? [firstPhoto(item)].filter((u): u is string => !!u)
    : forSaleItems(items)
        .map(firstPhoto)
        .filter((u): u is string => !!u)
        .slice(0, 4);
  // the grid is 1, 2 (side by side) or 4 (2×2) — drop a 3rd photo rather than leave a gap
  if (photos.length === 3) photos.pop();
  const uprightPhotos = await Promise.all(photos.map((url) => uprightPhoto(url, photos.length === 1 ? 1000 : 600)));

  const headline = item ? item.name : sale.name;
  const badge =
    phase === "now" ? "HAPPENING NOW" : phase === "ended" ? "SALE ENDED" : item ? null : "YARD SALE";
  const allText = [headline, badge, item ? money(item.price) : "", "SOLD", sale.name, ...lines, location, cats.join(" · "), `${count} items`, "Browse & reserve before you go"].join(" ");

  const [marker, sansBold, sans] = await Promise.all([
    googleFont("Permanent Marker", 400, allText),
    googleFont("Work Sans", 800, allText),
    googleFont("Work Sans", 600, allText),
  ]);
  const fonts: Font[] = [];
  if (marker) fonts.push({ name: "Marker", data: marker, weight: 400, style: "normal" });
  if (sansBold) fonts.push({ name: "Work Sans", data: sansBold, weight: 800, style: "normal" });
  if (sans) fonts.push({ name: "Work Sans", data: sans, weight: 600, style: "normal" });

  const photoSize = square ? { w: width - 96, h: 520 } : { w: 520, h: height - 96 };

  const photoPanel =
    photos.length > 0 ? (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: photoSize.w,
          height: photoSize.h,
          borderRadius: 24,
          overflow: "hidden",
          border: `6px solid ${CARDBOARD_DARK}`,
          background: CARDBOARD,
        }}
      >
        {uprightPhotos.map((src, i) => {
          // 1 photo: full panel; 2: side by side; 4: 2×2 grid
          const cols = photos.length === 1 ? 1 : 2;
          const rows = photos.length <= 2 ? 1 : 2;
          const w = (photoSize.w - 12) / cols;
          const h = (photoSize.h - 12) / rows;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} width={w} height={h} style={{ objectFit: "cover", width: w, height: h }} alt="" />
          );
        })}
      </div>
    ) : null;

  const text = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", minWidth: 0 }}>
      {badge && (
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              background: phase === "now" ? GRASS_DARK : phase === "ended" ? INK : MARKER,
              color: CHALK,
              fontFamily: "Work Sans",
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: 2,
              padding: "8px 18px",
              borderRadius: 12,
              marginBottom: 18,
            }}
          >
            {badge}
          </div>
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontFamily: "Marker",
          color: MARKER,
          fontSize: headline.length > 28 ? 52 : 68,
          lineHeight: 1.05,
          marginBottom: 18,
        }}
      >
        {headline}
      </div>
      {item && (
        <div style={{ display: "flex", fontFamily: "Work Sans", fontWeight: 800, fontSize: 64, color: INK, marginBottom: 12 }}>
          {item.status === "sold" ? "SOLD" : money(item.price)}
        </div>
      )}
      {item && (
        <div style={{ display: "flex", fontFamily: "Work Sans", fontWeight: 600, fontSize: 28, color: INK, opacity: 0.75, marginBottom: 10 }}>
          {sale.name}
        </div>
      )}
      {phase !== "ended" &&
        lines.map((l) => (
          <div key={l} style={{ display: "flex", fontFamily: "Work Sans", fontWeight: 800, fontSize: 34, color: INK, marginBottom: 6 }}>
            {l}
          </div>
        ))}
      {location && (
        <div style={{ display: "flex", fontFamily: "Work Sans", fontWeight: 600, fontSize: 30, color: GRASS_DARK, marginTop: 6 }}>
          {location}
        </div>
      )}
      {!item && (cats.length > 0 || count > 0) && (
        <div style={{ display: "flex", fontFamily: "Work Sans", fontWeight: 600, fontSize: 26, color: INK, opacity: 0.7, marginTop: 18 }}>
          {/* non-breaking space keeps "12 items" together when the line wraps */}
          {[cats.join(" · "), count > 0 ? `${count}\u00a0items` : ""].filter(Boolean).join(" — ")}
        </div>
      )}
      <div style={{ display: "flex", fontFamily: "Work Sans", fontWeight: 800, fontSize: 24, color: MARKER, marginTop: 24 }}>
        Browse &amp; reserve before you go
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: square ? "column" : "row",
          gap: 40,
          width: "100%",
          height: "100%",
          padding: 48,
          background: CHALK,
          border: `14px solid ${CARDBOARD}`,
          alignItems: square ? "stretch" : "center",
        }}
      >
        {photoPanel}
        {text}
      </div>
    ),
    { width, height, fonts: fonts.length > 0 ? fonts : undefined }
  );
}
