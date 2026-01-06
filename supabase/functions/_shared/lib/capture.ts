import type { LinearIssue } from "./types.ts";
import { parseIssueContent } from "./parse.ts";

/**
 * Dependencies for the capture pipeline.
 * Using dependency injection for testability.
 */
export interface CaptureDeps {
  cleanupContent: (text: string) => Promise<string>;
  createTriageIssue: (
    title: string,
    description?: string,
  ) => Promise<LinearIssue>;
}

/**
 * Core capture pipeline: cleans up raw text and creates a Linear issue.
 *
 * Pipeline steps:
 * 1. Clean up the raw text with Claude
 * 2. Parse into title and description
 * 3. Create Linear issue
 *
 * @param rawText - The raw input text to capture
 * @param deps - Injected dependencies for cleanup and issue creation
 * @returns The created Linear issue
 * @throws Error if cleanup results in empty content
 */
export async function captureToLinear(
  rawText: string,
  deps: CaptureDeps,
): Promise<LinearIssue> {
  // Step 1: Clean up the text
  const cleanedContent = await deps.cleanupContent(rawText);

  // Validate we have content
  if (cleanedContent.trim() === "") {
    throw new Error("Cleanup resulted in empty content");
  }

  // Step 2: Parse into title and description
  const { title, description } = parseIssueContent(cleanedContent);

  // Step 3: Create Linear issue
  const issue = await deps.createTriageIssue(title, description);

  return issue;
}
