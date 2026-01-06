import { cleanupContent } from "../_shared/lib/claude.ts";
import { createTriageIssue } from "../_shared/lib/linear.ts";
import { parseIssueContent } from "../_shared/lib/parse.ts";
import type { CreateIssueResponse } from "../_shared/lib/types.ts";

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

export async function handleCreateIssue(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  // Only accept POST requests
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // Get API keys from environment
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const linearKey = Deno.env.get("LINEAR_API_KEY");

  if (!anthropicKey || !linearKey) {
    return jsonResponse({ ok: false, error: "Server configuration error" }, 500);
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

    // Step 1: Clean up the text with Claude
    const cleanedContent = await cleanupContent(trimmedText, anthropicKey);

    if (cleanedContent.trim() === "") {
      return jsonResponse({ ok: false, error: "Cleanup resulted in empty content" }, 400);
    }

    // Step 2: Parse into title and description
    const { title, description } = parseIssueContent(cleanedContent);

    // Step 3: Create Linear issue
    const issue = await createTriageIssue(title, linearKey, undefined, description);

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
  Deno.serve(handleCreateIssue);
}
