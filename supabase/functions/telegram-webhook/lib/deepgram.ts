interface DeepgramResponse {
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
      }>;
    }>;
  };
}

function isDeepgramResponse(data: unknown): data is DeepgramResponse {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!obj.results || typeof obj.results !== "object") return false;
  const results = obj.results as Record<string, unknown>;
  if (!Array.isArray(results.channels)) return false;
  if (results.channels.length === 0) return false;
  const channel = results.channels[0] as Record<string, unknown>;
  if (!Array.isArray(channel.alternatives)) return false;
  if (channel.alternatives.length === 0) return false;
  const alt = channel.alternatives[0] as Record<string, unknown>;
  return typeof alt.transcript === "string";
}

export async function transcribeAudio(
  audioUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const response = await fetchFn("https://api.deepgram.com/v1/listen", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({ url: audioUrl }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!isDeepgramResponse(data)) {
    throw new Error("Invalid Deepgram response structure");
  }

  return data.results.channels[0].alternatives[0].transcript;
}
