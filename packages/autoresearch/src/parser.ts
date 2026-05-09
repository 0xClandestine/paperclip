/**
 * Parse a numeric score from raw eval stdout.
 *
 * Supported formats:
 *   - A single number:             "142.5"
 *   - A JSON object with "score":  '{"score": 142.5, "unit": "µs"}'
 *
 * Returns null if no score could be extracted.
 */
export function parseScore(rawOutput: string): number | null {
  const trimmed = rawOutput.trim();
  if (!trimmed) return null;

  // Try JSON first — look for a {"score": N} object anywhere in the output
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.score === "number") {
      return parsed.score;
    }
  } catch {
    // not JSON — try as plain number
  }

  // Try the last line as a plain number
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  const lastLine = lines[lines.length - 1].trim();
  const num = parseFloat(lastLine);
  if (!isNaN(num)) return num;

  return null;
}
