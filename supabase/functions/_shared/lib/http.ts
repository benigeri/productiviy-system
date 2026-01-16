/**
 * Shared HTTP utilities for edge functions.
 */

/**
 * Standard error codes for API responses.
 * These are stable and won't change - safe for agents to match on.
 */
export type ErrorCode =
  | "INVALID_METHOD"
  | "MISSING_TEXT"
  | "EMPTY_TEXT"
  | "EMPTY_AFTER_CLEANUP"
  | "CONFIG_ERROR"
  | "BRAINTRUST_ERROR"
  | "LINEAR_ERROR"
  | "INVALID_JSON"
  | "INVALID_PAYLOAD"
  | "UNAUTHORIZED"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export interface ErrorResponse {
  ok: false;
  error: string;
  code: ErrorCode;
}

export interface SuccessResponse<T = unknown> {
  ok: true;
  data?: T;
}

/**
 * Create a JSON response with proper headers.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a JSON error response with machine-readable error code.
 */
export function errorResponse(
  error: string,
  code: ErrorCode,
  status: number,
): Response {
  const body: ErrorResponse = { ok: false, error, code };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a JSON response with CORS headers.
 */
export function jsonResponseWithCors(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
  });
}

/**
 * Create an error response with CORS headers.
 */
export function errorResponseWithCors(
  error: string,
  code: ErrorCode,
  status: number,
): Response {
  const body: ErrorResponse = { ok: false, error, code };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
  });
}

/**
 * Default timeout for external API calls (30 seconds).
 */
export const DEFAULT_API_TIMEOUT = 30_000;

/**
 * Fetch with timeout using AbortController.
 * Throws an error if the request takes longer than the specified timeout.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_API_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
