interface ClaudeResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

function isClaudeResponse(data: unknown): data is ClaudeResponse {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.content)) return false;
  if (obj.content.length === 0) return false;
  const block = obj.content[0] as Record<string, unknown>;
  return block.type === "text" && typeof block.text === "string";
}

const CLEANUP_PROMPT = `You are a text cleanup assistant. Clean up the following voice transcription by:
- Removing filler words (um, uh, like, you know, etc.)
- Fixing grammar and punctuation
- Preserving the original meaning and intent
- Keeping it concise
- IMPORTANT: Preserve any prefix tags at the start (e.g. "// fb - name - from name" or similar markers). Only fix typos in them, never remove them.
- Convert checkboxes to proper markdown format for Linear:
  - "[ ] task" → "- [ ] task"
  - "[x] task" → "- [x] task"
  - Ensure each checkbox item is on its own line
- Format bullet points as proper markdown (use "- " at line start)

Return ONLY the cleaned text, nothing else. Do not add any explanation or commentary.

Text to clean:`;

export async function cleanupContent(
  text: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
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
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!isClaudeResponse(data)) {
    throw new Error("Invalid Claude response structure");
  }

  return data.content[0].text;
}
