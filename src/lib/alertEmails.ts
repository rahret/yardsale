/** The alert and confirmation emails' content: plain text plus simple HTML
 * that reads well in any mail app. Everything the seller or buyer typed is
 * escaped. */

import { formatPhone, money } from "./utils";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

/** Rows of label → value, rendered as a small table and as text lines. */
function render(o: {
  subject: string;
  heading: string;
  intro: string;
  rows: [string, string][];
  action: string;
  link: string;
  footer: string;
}): Rendered {
  const rowsHtml = o.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b6560;white-space:nowrap">${escapeHtml(k)}</td>` +
        `<td style="padding:4px 0;font-weight:bold">${escapeHtml(v)}</td></tr>`
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f3ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#33312e">
<div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #b08d57;border-radius:12px;padding:20px">
<h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(o.heading)}</h1>
<p style="margin:0 0 12px;line-height:1.45">${escapeHtml(o.intro)}</p>
<table style="border-collapse:collapse;font-size:15px;margin:0 0 16px">${rowsHtml}</table>
<a href="${escapeHtml(o.link)}" style="display:inline-block;background:#4a7c3f;color:#fff;font-weight:bold;text-decoration:none;padding:10px 16px;border-radius:8px">${escapeHtml(o.action)}</a>
<p style="margin:16px 0 0;font-size:12px;color:#8a847c;line-height:1.4">${escapeHtml(o.footer)}</p>
</div></body></html>`;
  const text = [o.heading, "", o.intro, "", ...o.rows.map(([k, v]) => (k ? `${k}: ${v}` : `  ${v}`)), "", `${o.action}: ${o.link}`, "", o.footer].join(
    "\n"
  );
  return { subject: o.subject, html, text };
}

const FOOTER = "You get these because email alerts are on in your Yard Sale QR account. Turn them off on your Account page.";

export function orderPaidEmail(o: {
  saleName: string;
  itemName: string;
  amountCents: number;
  feeCents: number;
  pickupCode: string;
  buyerName: string | null;
  buyerEmail: string | null;
  link: string;
}): Rendered {
  const rows: [string, string][] = [
    ["Item", o.itemName],
    ["Paid", money(o.amountCents / 100)],
    ["You receive", money((o.amountCents - o.feeCents) / 100)],
    ["Pickup code", o.pickupCode],
  ];
  if (o.buyerName) rows.push(["Buyer", o.buyerName]);
  if (o.buyerEmail) rows.push(["Buyer email", o.buyerEmail]);
  return render({
    subject: `💳 Sold online: ${o.itemName} — ${money(o.amountCents / 100)}`,
    heading: "You made a sale!",
    intro: `Someone paid for “${o.itemName}” at ${o.saleName}. Set it aside — they'll show you pickup code ${o.pickupCode} when they come for it.`,
    rows,
    action: "See your orders",
    link: o.link,
    footer: FOOTER,
  });
}

export function holdPlacedEmail(o: {
  saleName: string;
  itemName: string;
  price: number;
  buyerName: string;
  buyerPhone: string;
  holdUntil: string;
  link: string;
}): Rendered {
  return render({
    subject: `✋ Hold: ${o.itemName} for ${o.buyerName}`,
    heading: "Someone's holding an item",
    intro: `${o.buyerName} put a hold on “${o.itemName}” at ${o.saleName}. Keep it for them until ${o.holdUntil} — after that it's released automatically.`,
    rows: [
      ["Item", o.itemName],
      ["Price", money(o.price)],
      ["Held for", o.buyerName],
      ["Phone", formatPhone(o.buyerPhone)],
      ["Held until", o.holdUntil],
    ],
    action: "Open your sale",
    link: o.link,
    footer: FOOTER,
  });
}

/** Where and when to pick up, as email rows. */
function pickupRows(o: { address: string | null; days: string[] }): [string, string][] {
  const rows: [string, string][] = [];
  if (o.address) rows.push(["Where", o.address]);
  o.days.forEach((d, i) => rows.push([i === 0 ? "When" : "", d]));
  return rows;
}

const BUYER_FOOTER = "You got this email because you entered this address at a yard sale on Yard Sale QR.";

/** To the buyer: their Buy Now purchase and pickup code. */
export function buyerOrderEmail(o: {
  saleName: string;
  itemName: string;
  amountCents: number;
  pickupCode: string;
  address: string | null;
  days: string[];
  link: string;
}): Rendered {
  return render({
    subject: `Your pickup code for ${o.itemName}: ${o.pickupCode}`,
    heading: `It's yours! Pickup code ${o.pickupCode}`,
    intro: `You bought “${o.itemName}” at ${o.saleName}. Show pickup code ${o.pickupCode} to the seller when you collect it.`,
    rows: [["Item", o.itemName], ["Paid", money(o.amountCents / 100)], ["Pickup code", o.pickupCode], ...pickupRows(o)],
    action: "See your order",
    link: o.link,
    footer: BUYER_FOOTER,
  });
}

/** To the buyer: the hold they just placed. */
export function buyerHoldEmail(o: {
  saleName: string;
  itemName: string;
  price: number;
  buyerName: string;
  holdUntil: string;
  address: string | null;
  days: string[];
  link: string;
}): Rendered {
  return render({
    subject: `You're holding ${o.itemName} until ${o.holdUntil}`,
    heading: `You're holding “${o.itemName}”`,
    intro: `The seller at ${o.saleName} will keep it for you until ${o.holdUntil}. Pay in person and give your name (${o.buyerName}) when you pick it up. After ${o.holdUntil} the hold ends and it goes back on sale.`,
    rows: [["Item", o.itemName], ["Price", money(o.price)], ["Held until", o.holdUntil], ["Name", o.buyerName], ...pickupRows(o)],
    action: "See the item",
    link: o.link,
    footer: BUYER_FOOTER,
  });
}
