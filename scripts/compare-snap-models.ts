/**
 * Compares two Claude models on Snap & list: sends each photo in a folder to
 * both models with exactly the app's prompt, and writes a side-by-side report.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npm run compare-snap -- ./my-photos
 *
 * Options:
 *   --models claude-opus-5-5,claude-haiku-5-5   which two (or more) to compare
 *   --expected prices.csv   optional "filename,name,price" lines with what you'd
 *                           actually call the item and charge, to score prices
 *
 * Photos are prepared like the app does (rotated upright, 1600px, JPEG) before
 * sending. The report (snap-comparison.html + .json) is written into the photo
 * folder. Each run costs real money on your API account: roughly 1.5 cents per
 * photo on Opus 5.5 and well under a tenth of a cent on Haiku 5.5.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { costUsd, type SnapSuggestion } from "../src/lib/snapList";
import { readSuggestion, suggestionRequest } from "../src/lib/snapListRequest";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const folder = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const models = (opt("models") || "claude-opus-5-5,claude-haiku-5-5").split(",").map((m) => m.trim()).filter(Boolean);
const PARALLEL = 3;
const ITEMS_PER_SALE = 150;

if (!folder || !fs.existsSync(folder)) {
  console.error("Usage: npm run compare-snap -- <folder of photos> [--models a,b] [--expected prices.csv]");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY to your Claude API key first.");
  process.exit(1);
}

const photos = fs
  .readdirSync(folder)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort();
const skipped = fs.readdirSync(folder).filter((f) => /\.(heic|heif)$/i.test(f));
if (skipped.length) {
  console.warn(`Skipping ${skipped.length} HEIC photo(s) — export them as JPEG (iPhone: Settings → Camera → Formats → Most Compatible).`);
}
if (photos.length === 0) {
  console.error("No JPEG/PNG/WebP photos in that folder.");
  process.exit(1);
}

// optional answers: filename,name,price
const expected = new Map<string, { name: string; price: number }>();
const expectedFile = opt("expected");
if (expectedFile) {
  for (const line of fs.readFileSync(expectedFile, "utf8").split(/\r?\n/)) {
    const [file, name, price] = line.split(",").map((s) => s?.trim());
    if (file && name && price && !Number.isNaN(Number(price))) expected.set(file, { name, price: Number(price) });
  }
}

interface Run {
  model: string;
  answeredBy: string;
  suggestion: SnapSuggestion | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  seconds: number;
  error?: string;
}

const client = new Anthropic();

async function prepare(file: string): Promise<{ data: string; thumb: string }> {
  const img = sharp(path.join(folder!, file)).rotate();
  const full = await img.clone().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const thumb = await img.clone().resize(220, 220, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
  return { data: full.toString("base64"), thumb: thumb.toString("base64") };
}

async function ask(model: string, data: string): Promise<Run> {
  const started = Date.now();
  try {
    const response = await client.beta.messages.create(
      suggestionRequest(model, { type: "base64", media_type: "image/jpeg", data }, [])
    );
    const r = readSuggestion(response, []);
    return {
      model,
      answeredBy: r.model,
      suggestion: r.suggestion,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cost: costUsd(r.model, r.inputTokens, r.outputTokens) ?? 0,
      seconds: (Date.now() - started) / 1000,
      error: r.refused ? "refused" : r.suggestion ? undefined : "no usable answer",
    };
  } catch (e) {
    return { model, answeredBy: model, suggestion: null, inputTokens: 0, outputTokens: 0, cost: 0, seconds: (Date.now() - started) / 1000, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log(`Comparing ${models.join(" vs ")} on ${photos.length} photos…`);
  const results: { file: string; thumb: string; runs: Run[] }[] = [];
  let next = 0;
  async function worker() {
    while (next < photos.length) {
      const file = photos[next++];
      const { data, thumb } = await prepare(file);
      const runs = await Promise.all(models.map((m) => ask(m, data)));
      results.push({ file, thumb, runs });
      console.log(`  ${results.length}/${photos.length} ${file}: ` + runs.map((r) => `${r.model.replace("claude-", "")} → ${r.suggestion ? `${r.suggestion.name} $${r.suggestion.price}` : r.error}`).join(" | "));
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  results.sort((a, b) => a.file.localeCompare(b.file));

  // summary per model
  const summary = models.map((model) => {
    const runs = results.map((r) => r.runs.find((x) => x.model === model)!);
    const ok = runs.filter((r) => r.suggestion);
    const cost = runs.reduce((s, r) => s + r.cost, 0);
    const avgCost = cost / runs.length;
    const priced = results
      .map((r) => ({ exp: expected.get(r.file), s: r.runs.find((x) => x.model === model)!.suggestion }))
      .filter((x) => x.exp && x.s && x.exp.price > 0);
    const within = priced.filter((x) => Math.abs(x.s!.price - x.exp!.price) <= Math.max(1, x.exp!.price * 0.35)).length;
    return {
      model,
      answered: `${ok.length}/${runs.length}`,
      avgInputTokens: Math.round(runs.reduce((s, r) => s + r.inputTokens, 0) / runs.length),
      avgOutputTokens: Math.round(runs.reduce((s, r) => s + r.outputTokens, 0) / runs.length),
      avgSeconds: +(runs.reduce((s, r) => s + r.seconds, 0) / runs.length).toFixed(1),
      totalCostUsd: +cost.toFixed(4),
      costPerPhotoUsd: +avgCost.toFixed(5),
      costPerSaleUsd: +(avgCost * ITEMS_PER_SALE * 1.1).toFixed(2),
      priceWithin35pct: priced.length ? `${within}/${priced.length}` : "—",
    };
  });

  fs.writeFileSync(path.join(folder!, "snap-comparison.json"), JSON.stringify({ models, summary, results: results.map(({ thumb: _t, ...r }) => r) }, null, 2));
  fs.writeFileSync(path.join(folder!, "snap-comparison.html"), report(summary, results));
  console.table(summary);
  console.log(`\nReport: ${path.join(folder!, "snap-comparison.html")}`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function report(summary: Record<string, unknown>[], results: { file: string; thumb: string; runs: Run[] }[]): string {
  const head = Object.keys(summary[0]);
  const cell = (r: Run) =>
    r.suggestion
      ? `<b>${esc(r.suggestion.name)}</b><br><span class="p">$${r.suggestion.price}</span> · ${esc(r.suggestion.category)}${r.suggestion.quantity > 1 ? ` · ×${r.suggestion.quantity}` : ""}<br><small>${esc(r.suggestion.description)}</small>${r.suggestion.issue !== "none" ? `<br><i>${r.suggestion.issue}</i>` : ""}<br><small class="m">${r.suggestion.confidence} · ${r.seconds.toFixed(1)}s · $${r.cost.toFixed(4)}${r.answeredBy !== r.model ? ` · answered by ${esc(r.answeredBy)}` : ""}</small>`
      : `<i>${esc(r.error || "no answer")}</i>`;
  return `<!doctype html><meta charset="utf-8"><title>Snap & list model comparison</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;vertical-align:top;text-align:left}th{background:#f4f1ea}img{max-width:160px;border-radius:6px}.p{font-size:16px;font-weight:700;color:#2f6d2f}.m{color:#888}</style>
<h1>Snap &amp; list: ${models.map(esc).join(" vs ")}</h1>
<p>${results.length} photos · prices are list prices checked 2026-11-07 · "per sale" assumes ${ITEMS_PER_SALE} items + 10% retakes</p>
<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${summary.map((s) => `<tr>${head.map((h) => `<td>${esc(String(s[h]))}</td>`).join("")}</tr>`).join("")}</table>
<h2>Photo by photo</h2>
<table><tr><th>Photo</th>${expected.size ? "<th>Your answer</th>" : ""}${models.map((m) => `<th>${esc(m)}</th>`).join("")}</tr>
${results
  .map((r) => {
    const exp = expected.get(r.file);
    return `<tr><td><img src="data:image/jpeg;base64,${r.thumb}"><br><small>${esc(r.file)}</small></td>${expected.size ? `<td>${exp ? `<b>${esc(exp.name)}</b><br><span class="p">$${exp.price}</span>` : ""}</td>` : ""}${r.runs.map((x) => `<td>${cell(x)}</td>`).join("")}</tr>`;
  })
  .join("\n")}
</table>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
