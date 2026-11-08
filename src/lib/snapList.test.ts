import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { cleanSuggestion, costUsd, nudgePrice, stickerPrice } from "./snapList";
import { readSuggestion, suggestionRequest } from "./snapListRequest";

describe("stickerPrice", () => {
  it("rounds to prices people write on stickers", () => {
    expect(stickerPrice(0.1)).toBe(0.25);
    expect(stickerPrice(0.6)).toBe(0.5);
    expect(stickerPrice(1.4)).toBe(1);
    expect(stickerPrice(12.4)).toBe(12);
    expect(stickerPrice(23)).toBe(25);
    expect(stickerPrice(87)).toBe(85);
    expect(stickerPrice(-3)).toBe(0);
  });
});

describe("cleanSuggestion", () => {
  const ok = { name: "  Oak   rocking chair ", category: "furniture", price: 34, description: "Solid wood.", quantity: 1, confidence: "high", issue: "none" };

  it("tidies the answer and reuses the seller's category spelling", () => {
    expect(cleanSuggestion(ok, ["Furniture"])).toEqual({
      name: "Oak rocking chair",
      category: "Furniture",
      price: 35,
      description: "Solid wood.",
      quantity: 1,
      confidence: "high",
      issue: "none",
    });
  });

  it("keeps the answer usable when fields are off", () => {
    const s = cleanSuggestion({ ...ok, name: "x".repeat(90), category: "", quantity: 0, confidence: "very", issue: "weird" });
    expect(s?.name).toHaveLength(60);
    expect(s?.category).toBe("Misc");
    expect(s?.quantity).toBe(1);
    expect(s?.confidence).toBe("medium");
    expect(s?.issue).toBe("none");
  });

  it("rejects answers without a name", () => {
    expect(cleanSuggestion({ ...ok, name: " " })).toBeNull();
    expect(cleanSuggestion(null)).toBeNull();
  });
});

describe("price buttons and cost", () => {
  it("nudges without going below zero", () => {
    expect(nudgePrice(5, 1)).toBe(6);
    expect(nudgePrice(0.5, -1)).toBe(0);
  });
  it("costs a photo from the list prices", () => {
    expect(costUsd("claude-opus-5-5", 2000, 400)).toBeCloseTo(0.016, 6);
    expect(costUsd("claude-haiku-5-5", 2000, 400)).toBeCloseTo(0.0004, 6);
    expect(costUsd("unknown-model", 1, 1)).toBeNull();
  });
});

describe("the request", () => {
  const image = { type: "url" as const, url: "https://x.test/p.jpg" };

  it("asks for structured JSON at low effort, with the photo and categories", () => {
    const r = suggestionRequest("claude-opus-5-5", image, ["Tools"]);
    expect(r.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    const content = r.messages[0].content as Anthropic.Beta.BetaContentBlockParam[];
    expect(content[0]).toMatchObject({ type: "image", source: image });
    expect(JSON.stringify(content[1])).toContain("Tools");
  });

  it("uses Anthropic's fallback on Opus/Sonnet but not Haiku (which doesn't take it)", () => {
    expect(suggestionRequest("claude-opus-5-5", image, [])).toMatchObject({ fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(suggestionRequest("claude-haiku-5-5", image, [])).not.toHaveProperty("fallbacks");
  });
});

describe("readSuggestion", () => {
  const message = (over: Partial<Anthropic.Beta.BetaMessage>) =>
    ({
      model: "claude-haiku-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ name: "Lamp", category: "Home decor", price: 5, description: "", quantity: 1, confidence: "high", issue: "none" }) }],
      usage: { input_tokens: 1600, output_tokens: 120, cache_read_input_tokens: 0 },
      ...over,
    }) as unknown as Anthropic.Beta.BetaMessage;

  it("reads the suggestion and token use", () => {
    expect(readSuggestion(message({}), [])).toMatchObject({ suggestion: { name: "Lamp", price: 5 }, inputTokens: 1600, outputTokens: 120, refused: false });
  });
  it("handles refusals and broken JSON without throwing", () => {
    expect(readSuggestion(message({ stop_reason: "refusal", content: [] }), [])).toMatchObject({ suggestion: null, refused: true });
    expect(readSuggestion(message({ content: [{ type: "text", text: "not json" }] as never }), []).suggestion).toBeNull();
  });
});

describe("photo groups", () => {
  const p = (id: string, group: string | null = null) => ({ id, group });

  it("makes one listing per group and per ungrouped photo, in grid order", async () => {
    const { listingsFromPhotos } = await import("./snapList");
    const photos = [p("a"), p("b", "g1"), p("c"), p("d", "g1"), p("e", "g2"), p("f", "g2")];
    expect(listingsFromPhotos(photos).map((l) => l.map((x) => x.id))).toEqual([["a"], ["b", "d"], ["c"], ["e", "f"]]);
    expect(listingsFromPhotos([])).toEqual([]);
  });

  it("numbers groups in the order they first appear", async () => {
    const { groupNumbers } = await import("./snapList");
    const n = groupNumbers([p("a"), p("b", "x"), p("c", "y"), p("d", "x")]);
    expect([n.get("x"), n.get("y")]).toEqual([1, 2]);
  });
});
