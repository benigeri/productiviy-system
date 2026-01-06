import type { ParsedIssueContent } from "./types.ts";

/**
 * Parses content into title and optional description.
 * First line becomes the title, remaining lines become the description.
 */
export function parseIssueContent(content: string): ParsedIssueContent {
  const lines = content.split("\n");
  const title = lines[0].trim();
  const description = lines.slice(1).join("\n").trim() || undefined;

  return { title, description };
}
