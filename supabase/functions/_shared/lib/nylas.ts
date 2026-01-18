/**
 * Nylas API client for email operations.
 * Uses dependency injection for fetch to enable testing.
 */

import type {
  NylasCleanMessage,
  NylasFolder,
  NylasMessage,
  NylasThread,
} from "./nylas-types.ts";

const NYLAS_BASE_URL = "https://api.us.nylas.com/v3";

export interface NylasClient {
  getMessage(messageId: string): Promise<NylasMessage>;
  getThread(threadId: string): Promise<NylasThread>;
  getFolders(): Promise<NylasFolder[]>;
  updateMessageFolders(
    messageId: string,
    folders: string[],
  ): Promise<NylasMessage>;
  getCleanMessages(messageIds: string[]): Promise<NylasCleanMessage[]>;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Verify Nylas webhook signature using HMAC-SHA256.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyNylasSignature(
  signature: string,
  body: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(body),
    );

    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return timingSafeEqual(signature, expectedHex);
  } catch {
    return false;
  }
}

/**
 * Create a Nylas API client for a specific grant.
 */
export function createNylasClient(
  apiKey: string,
  grantId: string,
  fetchFn: typeof fetch = fetch,
): NylasClient {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const baseUrl = `${NYLAS_BASE_URL}/grants/${grantId}`;

  async function apiRequest<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const response = await fetchFn(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Nylas API error: ${response.status} ${response.statusText}`,
      );
    }

    const json = await response.json();
    return json.data;
  }

  return {
    getMessage(messageId: string): Promise<NylasMessage> {
      return apiRequest<NylasMessage>(`/messages/${messageId}`);
    },

    getThread(threadId: string): Promise<NylasThread> {
      return apiRequest<NylasThread>(`/threads/${threadId}`);
    },

    getFolders(): Promise<NylasFolder[]> {
      // Use limit=200 to ensure all folders are returned (default is ~50)
      return apiRequest<NylasFolder[]>("/folders?limit=200");
    },

    updateMessageFolders(
      messageId: string,
      folders: string[],
    ): Promise<NylasMessage> {
      return apiRequest<NylasMessage>(`/messages/${messageId}`, {
        method: "PUT",
        body: JSON.stringify({ folders }),
      });
    },

    async getCleanMessages(messageIds: string[]): Promise<NylasCleanMessage[]> {
      // Clean API returns array directly, not wrapped in data
      const response = await fetchFn(`${baseUrl}/messages/clean`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message_id: messageIds,
          ignore_images: false, // Don't ignore images - prevents 'span' text in output
          html_as_markdown: true,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Nylas API error: ${response.status} ${response.statusText}`,
        );
      }

      const json = await response.json();
      return json.data;
    },
  };
}
