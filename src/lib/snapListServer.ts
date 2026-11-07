import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_SNAP_MODEL } from "./snapList";
import { readSuggestion, suggestionRequest, type SuggestResult } from "./snapListRequest";

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
