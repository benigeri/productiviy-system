/**
 * Braintrust integration for capture processing.
 * Uses Braintrust proxy for LLM calls with observability.
 */

import type { CaptureResult } from "./capture.ts";
import { fetchWithTimeout, DEFAULT_API_TIMEOUT } from "./http.ts";

const SYSTEM_PROMPT = `You are a text cleanup assistant that processes voice transcriptions into clean Linear issues.

**Cleanup Guidelines:**
- Remove filler words (um, uh, like, you know, etc.)
- Fix grammar and punctuation
- Preserve the original meaning and intent
- Keep it concise
- Convert checkboxes to proper markdown format:
  - "[ ] task" → "- [ ] task"
  - "[x] task" → "- [x] task"
- Format bullet points as proper markdown (use "- " at line start)

**Feedback Detection:**
Set is_feedback to true if the text STARTS with a feedback prefix. Be flexible with detection:
- Exact: "// fb -", "// fb-", "//fb -", "//fb-"
- Without slashes: "fb -", "fb-", "FB -", "FB-"
- Common typos: "fb-", "fb -", "/fb -", "/ fb -", "//fb", "fb"
- Case insensitive: "FB", "Fb", "fb" all count

The key pattern is: text starts with optional slashes, then "fb", then optional dash/space.

**For feedback items:**
KEEP the "fb - " prefix in the output, reformatted as: "fb - Name: their feedback"
Example: "fb - John Doe - Great product!" → cleaned_content: "fb - John Doe: Great product!"
Example: "FB- sarah loves it" → cleaned_content: "fb - Sarah: loves it"

**For regular items (not feedback):**
Just clean up the text normally.

**Output Format:**
Return ONLY valid JSON:
{
  "cleaned_content": "Title here",
  "is_feedback": false
}`;

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface BraintrustResult {
  cleaned_content?: string;
  is_feedback?: boolean;
}

/**
 * Process captured text using Braintrust proxy.
 * Cleans up voice transcriptions and detects feedback items.
 *
 * @param rawText - Raw text to process
 * @param apiKey - Braintrust API key
 * @param _projectName - Braintrust project name (unused, kept for API compatibility)
 * @param _slug - Prompt slug (unused, kept for API compatibility)
 * @param fetchFn - Optional fetch function for testing
 * @returns CaptureResult with cleaned content and feedback flag
 */
export async function processCapture(
  rawText: string,
  apiKey: string,
  _projectName: string,
  _slug = "capture-cleanup",
  fetchFn: typeof fetch = fetch,
): Promise<CaptureResult> {
  const trimmed = rawText.trim();
  if (trimmed === "") {
    return { cleanedContent: "", isFeedback: false };
  }

  // Use Braintrust proxy for OpenAI-compatible API
  // This provides observability via Braintrust dashboard
  const requestOptions: RequestInit = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Process this text and return the JSON result:\n\n${trimmed}` },
      ],
      max_tokens: 1024,
    }),
  };

  // Use fetchWithTimeout in production, allow custom fetch for tests
  const response = fetchFn === fetch
    ? await fetchWithTimeout("https://braintrustproxy.com/v1/chat/completions", requestOptions, DEFAULT_API_TIMEOUT)
    : await fetchFn("https://braintrustproxy.com/v1/chat/completions", requestOptions);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Braintrust API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const chatResponse = await response.json() as ChatCompletionResponse;

  // Extract content from chat completion response
  const content = chatResponse.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Invalid Braintrust response: no content in response");
  }

  // Parse JSON from response (strip markdown code blocks if present)
  let jsonContent = content.trim();
  if (jsonContent.startsWith("```json")) {
    jsonContent = jsonContent.slice(7);
  } else if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.slice(3);
  }
  if (jsonContent.endsWith("```")) {
    jsonContent = jsonContent.slice(0, -3);
  }
  jsonContent = jsonContent.trim();

  let result: BraintrustResult;
  try {
    result = JSON.parse(jsonContent);
  } catch {
    throw new Error(`Invalid Braintrust response: could not parse JSON - ${content}`);
  }

  // Validate response structure
  if (typeof result.cleaned_content !== "string") {
    throw new Error("Invalid Braintrust response: missing cleaned_content");
  }

  return {
    cleanedContent: result.cleaned_content,
    isFeedback: result.is_feedback ?? false,
  };
}
