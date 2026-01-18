import { CLEANUP_PROMPT } from "../config/prompts.ts";
import type { ClaudeResponse } from "./types.ts";

function isClaudeResponse(data: unknown): data is ClaudeResponse {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.content)) return false;
  if (obj.content.length === 0) return false;
  const block = obj.content[0] as Record<string, unknown>;
  return block.type === "text" && typeof block.text === "string";
}

export async function cleanupContent(
  text: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }

  const response = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${CLEANUP_PROMPT}\n${trimmed}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Claude API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (!isClaudeResponse(data)) {
    throw new Error("Invalid Claude response structure");
  }

  return data.content[0].text;
}
