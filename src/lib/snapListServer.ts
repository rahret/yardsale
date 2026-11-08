import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_SNAP_MODEL } from "./snapList";
import { readSuggestion, suggestionRequest, type SuggestResult } from "./snapListRequest";

/** Whether Snap & list suggests listings with Claude: on when ANTHROPIC_API_KEY
 * is set, unless SNAP_LIST_AI=off. Without it, Snap & list still works as a
 * photo-first flow where the seller fills in each card. */
export function snapAiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.SNAP_LIST_AI?.trim().toLowerCase() !== "off";
}

/** The Claude client for Snap & list, or null when ANTHROPIC_API_KEY isn't
 * set (the feature then says it's unavailable instead of failing). */
export function getAnthropic(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

export function snapModel(): string {
  return process.env.SNAP_LIST_MODEL?.trim() || DEFAULT_SNAP_MODEL;
}

/** Asks Claude for a listing for one photo (by public URL). */
export async function suggestListing(
  client: Anthropic,
  imageUrl: string,
  saleCategories: string[],
  model = snapModel()
): Promise<SuggestResult> {
  const response = await client.beta.messages.create(
    suggestionRequest(model, { type: "url", url: imageUrl }, saleCategories)
  );
  return readSuggestion(response, saleCategories);
}
