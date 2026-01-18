import type { LinearIssue } from "./types.ts";
import { parseIssueContent } from "./parse.ts";
import {
  BACKLOG_STATE_ID,
  FEEDBACK_PROJECT_ID,
  type IssueCreateOptions,
} from "./linear.ts";

/**
 * Result from processing captured text.
 */
export interface CaptureResult {
  /** Cleaned content (title + optional description) */
  cleanedContent: string;
  /** Whether this is a feedback item (// fb - prefix) */
  isFeedback: boolean;
}

/**
 * Dependencies for the capture pipeline.
 * Using dependency injection for testability.
 */
export interface CaptureDeps {
  /**
   * Process raw text and detect if it's feedback.
   * @param text - Raw text to process
   * @returns Cleaned content and feedback flag
   */
  processCapture: (text: string) => Promise<CaptureResult>;
  /**
   * Create a Linear issue with optional routing options.
   * @param title - Issue title
   * @param description - Optional description
   * @param options - Optional routing (projectId, stateId)
   */
  createIssue: (
    title: string,
    description?: string,
    options?: IssueCreateOptions,
  ) => Promise<LinearIssue>;
}

/**
 * Core capture pipeline: processes raw text and creates a Linear issue.
 *
 * Pipeline steps:
 * 1. Process the raw text (cleanup + feedback detection)
 * 2. Parse into title and description
 * 3. Route to appropriate project/state based on feedback flag
 * 4. Create Linear issue
 *
 * @param rawText - The raw input text to capture
 * @param deps - Injected dependencies for processing and issue creation
 * @returns The created Linear issue
 * @throws Error if cleanup results in empty content
 */
export async function captureToLinear(
  rawText: string,
  deps: CaptureDeps,
): Promise<LinearIssue> {
  // Step 1: Process the text (cleanup + feedback detection)
  const result = await deps.processCapture(rawText);

  // Validate we have content
  if (result.cleanedContent.trim() === "") {
    throw new Error("Cleanup resulted in empty content");
  }

  // Step 2: Parse into title and description
  const { title, description } = parseIssueContent(result.cleanedContent);

  // Step 3: Route based on feedback flag
  if (result.isFeedback) {
    // Feedback items go to Feedback project in Backlog state
    return deps.createIssue(title, description, {
      projectId: FEEDBACK_PROJECT_ID,
      stateId: BACKLOG_STATE_ID,
    });
  }

  // Step 4: Regular items go to Triage (default)
  return deps.createIssue(title, description);
}
