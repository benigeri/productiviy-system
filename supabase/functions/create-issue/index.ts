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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // If deps not provided, create from environment (production mode)
  let effectiveDeps = deps;
  if (!effectiveDeps) {
    const braintrustKey = Deno.env.get("BRAINTRUST_API_KEY");
    const braintrustProject = Deno.env.get("BRAINTRUST_PROJECT_NAME") ?? "Productivity_System";
    const braintrustSlug = Deno.env.get("BRAINTRUST_CAPTURE_SLUG") ?? "capture-cleanup";
    const linearKey = Deno.env.get("LINEAR_API_KEY");

    if (!braintrustKey || !linearKey) {
      return jsonResponse({ ok: false, error: "Server configuration error" }, 500);
    }

    effectiveDeps = {
      processCapture: (text) =>
        processCaptureImpl(text, braintrustKey, braintrustProject, braintrustSlug),
      createIssue: (title, description, options) =>
        createTriageIssueImpl(title, linearKey, undefined, description, undefined, options),
    };
  }

  try {
    const body: CreateIssueRequest = await request.json();

    if (!body.text || typeof body.text !== "string") {
      return jsonResponse({ ok: false, error: "Missing or invalid 'text' field" }, 400);
    }

    const trimmedText = body.text.trim();
    if (trimmedText === "") {
      return jsonResponse({ ok: false, error: "Text cannot be empty" }, 400);
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

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Handle empty content error from capture pipeline
    if (message === "Cleanup resulted in empty content") {
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
}

// Production handler
if (import.meta.main) {
  Deno.serve((req) => handleCreateIssue(req));
}
