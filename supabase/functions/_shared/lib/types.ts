/**
 * Shared types used across Supabase functions.
 */

// Linear issue response from the GraphQL API
export interface LinearIssue {
  id: string;
  identifier: string;
  url: string;
}

// Claude API response structure
export interface ClaudeResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

// Linear GraphQL response structure
export interface LinearResponse {
  data?: {
    issueCreate: {
      success: boolean;
      issue: LinearIssue | null;
    };
  };
  errors?: Array<{ message: string }>;
}

// Parsed issue content (title and optional description)
export interface ParsedIssueContent {
  title: string;
  description?: string;
}

// Generic API response for create-issue function
export interface CreateIssueResponse {
  ok: boolean;
  issue?: LinearIssue;
  error?: string;
}
