import { createHash } from "node:crypto";

/** Compute SHA-256 of an eval file's content for immutability verification. */
export function hashEvalContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
