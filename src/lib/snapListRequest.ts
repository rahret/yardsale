import type Anthropic from "@anthropic-ai/sdk";
import { SNAP_SCHEMA, SNAP_SYSTEM_PROMPT, cleanSuggestion, snapUserText, type SnapSuggestion } from "./snapList";

type ImageSource = Anthropic.Beta.BetaURLImageSource | Anthropic.Beta.BetaBase64ImageSource;

/** Models that take Anthropic's server-side fallback (Haiku doesn't). */
const FALLBACK_MODELS = /^claude-(opus|sonnet|fable)-/;

/** The Messages API request for one photo: the app and the comparison
 * script both send exactly this. Low effort keeps thinking (and cost) short;
 * structured output guarantees the JSON shape. */
export function suggestionRequest(
  model: string,
  image: ImageSource,
  saleCategories: string[]
): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const fallback = FALLBACK_MODELS.test(model);
  return {
    model,
    max_tokens: 4000,
    system: SNAP_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: image },
          { type: "text", text: snapUserText(saleCategories) },
        ],
      },
    ],
    output_config: { effort: "low", format: { type: "json_schema", schema: SNAP_SCHEMA as unknown as Record<string, unknown> } },
    // if a model declines (very unlikely for item photos), Anthropic retries on
    // its recommended fallback model instead of failing
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export interface SuggestResult {
  suggestion: SnapSuggestion | null;
  /** The model that actually answered (differs if a fallback ran). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  refused: boolean;
}

/** The suggestion in a response, checked and tidied (null if unusable). */
export function readSuggestion(response: Anthropic.Beta.BetaMessage, saleCategories: string[]): SuggestResult {
  const usage = {
    model: response.model,
    inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };
  if (response.stop_reason === "refusal") return { suggestion: null, refused: true, ...usage };
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { suggestion: cleanSuggestion(parsed, saleCategories), refused: false, ...usage };
}
