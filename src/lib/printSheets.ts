/** Page layouts for printed price tags and flyers on US Letter paper
 * (8.5 × 11 in). Positions are worked out in inches from the label maker's
 * specs, then turned into percentages of the page, so the same layout draws
 * the on-screen preview and the printed page (printed with no page margins). */

export const PAGE_WIDTH_IN = 8.5;
export const PAGE_HEIGHT_IN = 11;

export interface SheetLayout {
  key: string;
  label: string;
  cols: number;
  rows: number;
  /** Each label's size and the distance from one label's corner to the next. */
  widthIn: number;
  heightIn: number;
  leftIn: number;
  topIn: number;
  pitchXIn: number;
  pitchYIn: number;
  /** Plain paper: draw dashed lines to cut along. */
  cutLines: boolean;
}

export const TAG_LAYOUTS: SheetLayout[] = [
  {
    key: "avery5160",
    label: "Small labels — Avery 5160 / 8160 (30 per sheet, 2⅝ × 1 in)",
    cols: 3,
    rows: 10,
    widthIn: 2.625,
    heightIn: 1,
    leftIn: 0.1875,
    topIn: 0.5,
    pitchXIn: 2.75,
    pitchYIn: 1,
    cutLines: false,
  },
  {
    key: "avery5163",
    label: "Large labels — Avery 5163 / 8163 (10 per sheet, 4 × 2 in)",
    cols: 2,
    rows: 5,
    widthIn: 4,
    heightIn: 2,
    leftIn: 0.15625,
    topIn: 0.5,
    pitchXIn: 4.1875,
    pitchYIn: 2,
    cutLines: false,
  },
  {
    key: "plain",
    label: "Plain paper, cut apart (18 per sheet, 2¾ × 1¾ in)",
    cols: 3,
    rows: 6,
    widthIn: 2.75,
    heightIn: 1.75,
    leftIn: 0.125,
    topIn: 0.25,
    pitchXIn: 2.75,
    pitchYIn: 1.75,
    cutLines: true,
  },
];

export const FLYER_LAYOUTS: SheetLayout[] = [
  {
    key: "quarter",
    label: "4 per sheet (quarter page, cut apart)",
    cols: 2,
    rows: 2,
    widthIn: 4.25,
    heightIn: 5.5,
    leftIn: 0,
    topIn: 0,
    pitchXIn: 4.25,
    pitchYIn: 5.5,
    cutLines: true,
  },
  {
    key: "full",
    label: "1 per sheet (full page)",
    cols: 1,
    rows: 1,
    widthIn: 8.5,
    heightIn: 11,
    leftIn: 0,
    topIn: 0,
    pitchXIn: 8.5,
    pitchYIn: 11,
    cutLines: false,
  },
];

export function perSheet(layout: SheetLayout): number {
  return layout.cols * layout.rows;
}

/** Where label number `index` (0-based, across then down) sits on its page, as
 * percentages of the page's width and height. */
export function slotBox(layout: SheetLayout, index: number): { left: number; top: number; width: number; height: number } {
  const i = index % perSheet(layout);
  const col = i % layout.cols;
  const row = Math.floor(i / layout.cols);
  return {
    left: ((layout.leftIn + col * layout.pitchXIn) / PAGE_WIDTH_IN) * 100,
    top: ((layout.topIn + row * layout.pitchYIn) / PAGE_HEIGHT_IN) * 100,
    width: (layout.widthIn / PAGE_WIDTH_IN) * 100,
    height: (layout.heightIn / PAGE_HEIGHT_IN) * 100,
  };
}

/** Splits things into pages of a sheet layout. */
export function paginate<T>(things: T[], layout: SheetLayout): T[][] {
  const n = perSheet(layout);
  const pages: T[][] = [];
  for (let i = 0; i < things.length; i += n) pages.push(things.slice(i, i + n));
  return pages;
}

/** "$5", "$0.50", "$2 each" for bulk lots, "FREE" for $0. */
export function tagPrice(price: number, bulk: boolean): string {
  if (!(price > 0)) return "FREE";
  const p = price % 1 === 0 ? `$${price}` : `$${price.toFixed(2)}`;
  return bulk ? `${p} each` : p;
}
