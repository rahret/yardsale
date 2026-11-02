/** Choosing how to break a short text (like a sign title) into lines so it
 * can be drawn as large as possible inside a box. */

/** Every way to split the words into lines, keeping their order. */
export function lineSplits(words: string[]): string[][] {
  if (words.length === 0) return [[]];
  // 2^(n-1) splits; titles are short, but cap it to stay cheap
  const n = Math.min(words.length, 10);
  const ws = words.length > n ? [...words.slice(0, n - 1), words.slice(n - 1).join(" ")] : words;
  const out: string[][] = [];
  for (let mask = 0; mask < 1 << (ws.length - 1); mask++) {
    const lines: string[] = [];
    let current = ws[0];
    for (let i = 1; i < ws.length; i++) {
      if (mask & (1 << (i - 1))) {
        lines.push(current);
        current = ws[i];
      } else {
        current += " " + ws[i];
      }
    }
    lines.push(current);
    out.push(lines);
  }
  return out;
}

/** The line breaks that let the text be drawn biggest inside a box of the
 * given shape. widthOf measures a line at the same size lineHeight and step
 * (the distance from one line's baseline to the next) are given in. Ties go
 * to fewer lines. */
export function bestWrap(
  text: string,
  widthOf: (line: string) => number,
  box: { width: number; height: number },
  lineHeight: number,
  step: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let best: string[] = [words.join(" ")];
  let bestScale = -1;
  for (const lines of lineSplits(words)) {
    const width = Math.max(...lines.map(widthOf), 1);
    const height = lineHeight + step * (lines.length - 1);
    const scale = Math.min(box.width / width, box.height / height);
    if (scale > bestScale * 1.0001) {
      best = lines;
      bestScale = scale;
    }
  }
  return best;
}
