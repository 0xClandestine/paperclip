// Feynman is built on Pi and emits the same JSONL output format.
// This mirrors the Pi parser rather than cross-importing across adapter packages.
import { asNumber, asString, parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface ParsedFeynmanOutput {
  sessionId: string | null;
  messages: string[];
  errors: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    costUsd: number;
  };
  finalMessage: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractTextContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("");
}

export function parseFeynmanJsonl(stdout: string): ParsedFeynmanOutput {
  const result: ParsedFeynmanOutput = {
    sessionId: null,
    messages: [],
    errors: [],
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0 },
    finalMessage: null,
  };

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const eventType = asString(event.type, "");

    if (eventType === "agent_end") {
      const messages = event.messages as Array<Record<string, unknown>> | undefined;
      if (messages && messages.length > 0) {
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
          const content = last.content as string | Array<{ type: string; text?: string }>;
          result.finalMessage = extractTextContent(content);
        }
      }
      continue;
    }

    if (eventType === "auto_retry_end") {
      if (event.success !== true) {
        const finalError = asString(event.finalError, "").trim();
        result.errors.push(finalError || "Feynman exhausted automatic retries without producing a response.");
      }
      continue;
    }

    if (eventType === "turn_end") {
      const message = asRecord(event.message);
      if (message) {
        const content = message.content as string | Array<{ type: string; text?: string }>;
        const text = extractTextContent(content);
        if (text) {
          result.finalMessage = text;
          result.messages.push(text);
        }
        const usage = asRecord(message.usage);
        if (usage) {
          result.usage.inputTokens += asNumber(usage.input, 0);
          result.usage.outputTokens += asNumber(usage.output, 0);
          result.usage.cachedInputTokens += asNumber(usage.cacheRead, 0);
          const cost = asRecord(usage.cost);
          if (cost) result.usage.costUsd += asNumber(cost.total, 0);
        }
      }
      continue;
    }

    if (eventType === "message_update") {
      const assistantEvent = asRecord(event.assistantMessageEvent);
      if (assistantEvent && asString(assistantEvent.type, "") === "text_delta") {
        const delta = asString(assistantEvent.delta, "");
        if (delta) {
          if (result.messages.length === 0) result.messages.push(delta);
          else result.messages[result.messages.length - 1] += delta;
        }
      }
      continue;
    }

    if (eventType === "error") {
      const msg = asString(event.message, "").trim();
      if (msg) result.errors.push(msg);
      continue;
    }

    if (eventType === "usage" || event.usage) {
      const usage = asRecord(event.usage);
      if (usage) {
        result.usage.inputTokens += asNumber(usage.inputTokens ?? usage.input, 0);
        result.usage.outputTokens += asNumber(usage.outputTokens ?? usage.output, 0);
        result.usage.cachedInputTokens += asNumber(usage.cachedInputTokens ?? usage.cacheRead, 0);
        const cost = asRecord(usage.cost);
        if (cost) result.usage.costUsd += asNumber(cost.total ?? usage.costUsd, 0);
        else result.usage.costUsd += asNumber(usage.costUsd, 0);
      }
    }
  }

  return result;
}

export function isFeynmanUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return /unknown\s+session|session\s+not\s+found|session\s+.*\s+not\s+found|no\s+session/i.test(haystack);
}
