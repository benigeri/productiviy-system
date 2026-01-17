import { processCapture as processCaptureImpl } from "../_shared/lib/braintrust.ts";
import {
  createTriageIssue as createTriageIssueImpl,
  type IssueCreateOptions,
} from "../_shared/lib/linear.ts";
import {
  captureToLinear,
  type CaptureDeps,
  type CaptureResult,
} from "../_shared/lib/capture.ts";
import type { CreateIssueResponse, LinearIssue } from "../_shared/lib/types.ts";
import {
  jsonResponseWithCors,
  errorResponseWithCors,
  type ErrorCode,
} from "../_shared/lib/http.ts";

/**
 * Dependencies for the create-issue handler.
 * Functions should have API keys pre-bound at construction time.
 */
export interface CreateIssueDeps {
  processCapture: (text: string) => Promise<CaptureResult>;
  createIssue: (
    title: string,
    description?: string,
    options?: IssueCreateOptions,
  ) => Promise<LinearIssue>;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

interface CreateIssueRequest {
  text: string;
}

export async function handleCreateIssue(
  request: Request,
  deps?: CreateIssueDeps,
): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  // Only accept POST requests
  if (request.method !== "POST") {
    return errorResponseWithCors("Method not allowed", "INVALID_METHOD", 405);
  }

  // If deps not provided, create from environment (production mode)
  let effectiveDeps = deps;
  if (!effectiveDeps) {
    const braintrustKey = Deno.env.get("BRAINTRUST_API_KEY");
    const braintrustProjectId = Deno.env.get("BRAINTRUST_PROJECT_ID") ?? "183dc023-466f-4dd9-8a33-ccfdf798a0e5";
    const braintrustSlug = Deno.env.get("BRAINTRUST_CAPTURE_SLUG") ?? "capture-cleanup";
    const linearKey = Deno.env.get("LINEAR_API_KEY");

    if (!braintrustKey || !linearKey) {
      return errorResponseWithCors("Server configuration error", "CONFIG_ERROR", 500);
    }

    effectiveDeps = {
      processCapture: (text) =>
        processCaptureImpl(text, braintrustKey, braintrustProjectId, braintrustSlug),
      createIssue: (title, description, options) =>
        createTriageIssueImpl(title, linearKey, undefined, description, undefined, options),
    };
  }

  try {
    const body: CreateIssueRequest = await request.json();

    if (!body.text || typeof body.text !== "string") {
      return errorResponseWithCors("Missing or invalid 'text' field", "MISSING_TEXT", 400);
    }

    const trimmedText = body.text.trim();
    if (trimmedText === "") {
      return errorResponseWithCors("Text cannot be empty", "EMPTY_TEXT", 400);
    }

    // Create CaptureDeps from CreateIssueDeps (interfaces are compatible)
    const captureDeps: CaptureDeps = {
      processCapture: effectiveDeps.processCapture,
      createIssue: effectiveDeps.createIssue,
    };

    // Use shared capture pipeline: process → parse → route → create issue
    const issue = await captureToLinear(trimmedText, captureDeps);

    const response: CreateIssueResponse = {
      ok: true,
      issue,
    };

    return jsonResponseWithCors(response, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Handle empty content error from capture pipeline
    if (message === "Cleanup resulted in empty content") {
      return errorResponseWithCors(message, "EMPTY_AFTER_CLEANUP", 400);
    }

    // Categorize errors by source
    let code: ErrorCode = "UNKNOWN_ERROR";
    if (message.includes("Braintrust")) code = "BRAINTRUST_ERROR";
    else if (message.includes("Linear")) code = "LINEAR_ERROR";
    else if (message.includes("timed out")) code = "TIMEOUT";

    return errorResponseWithCors(message, code, 500);
  }
}

// Production handler
if (import.meta.main) {
  Deno.serve((req) => handleCreateIssue(req));
}
