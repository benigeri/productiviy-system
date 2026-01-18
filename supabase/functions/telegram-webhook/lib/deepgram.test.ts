import { assertEquals, assertRejects } from "@std/assert";
import { transcribeAudio } from "./deepgram.ts";

// ============================================================================
// transcribeAudio tests
// ============================================================================

Deno.test("transcribeAudio - transcribes audio from URL", async () => {
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("api.deepgram.com")) {
      // Verify request structure
      assertEquals(init?.method, "POST");
      const headers = init?.headers as Record<string, string>;
      assertEquals(headers["Content-Type"], "application/json");
      assertEquals(headers["Authorization"], "Token test_api_key");

      const body = JSON.parse(init?.body as string);
      assertEquals(
        body.url,
        "https://api.telegram.org/file/bot123/voice/file.oga",
      );

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            results: {
              channels: [
                {
                  alternatives: [
                    { transcript: "Create a task for the homepage redesign" },
                  ],
                },
              ],
            },
          }),
      } as Response);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await transcribeAudio(
    "https://api.telegram.org/file/bot123/voice/file.oga",
    "test_api_key",
    mockFetch,
  );

  assertEquals(result, "Create a task for the homepage redesign");
});

Deno.test("transcribeAudio - returns empty string for no speech", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            channels: [
              {
                alternatives: [{ transcript: "" }],
              },
            ],
          },
        }),
    } as Response);

  const result = await transcribeAudio(
    "https://example.com/audio.oga",
    "test_api_key",
    mockFetch,
  );

  assertEquals(result, "");
});

Deno.test("transcribeAudio - throws on API error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response);

  await assertRejects(
    () =>
      transcribeAudio(
        "https://example.com/audio.oga",
        "bad_api_key",
        mockFetch,
      ),
    Error,
    "Deepgram API error: 401 Unauthorized",
  );
});

Deno.test("transcribeAudio - throws on network error", async () => {
  const mockFetch = () => Promise.reject(new Error("Network error"));

  await assertRejects(
    () =>
      transcribeAudio(
        "https://example.com/audio.oga",
        "test_api_key",
        mockFetch,
      ),
    Error,
    "Network error",
  );
});

Deno.test("transcribeAudio - handles malformed response", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ unexpected: "structure" }),
    } as Response);

  await assertRejects(
    () =>
      transcribeAudio(
        "https://example.com/audio.oga",
        "test_api_key",
        mockFetch,
      ),
    Error,
    "Invalid Deepgram response structure",
  );
});
