import type { LinearIssue, LinearResponse } from "./types.ts";

const CREATE_ISSUE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }
`;

// Default team ID - can be overridden via environment variable
const DEFAULT_TEAM_ID = "418bd6ee-1f6d-47cc-87f2-88b7371b743a";

// Feedback routing constants
export const FEEDBACK_PROJECT_ID = "4884f918-c57e-480e-8413-51bff5f933f8";
export const BACKLOG_STATE_ID = "e02b40e5-d86b-4c35-a81d-74cd3ad0a150";

/**
 * Options for creating an issue with routing.
 */
export interface IssueCreateOptions {
  /** Assign to a specific project */
  projectId?: string;
  /** Set the workflow state (e.g., Backlog instead of Triage) */
  stateId?: string;
}

export async function createTriageIssue(
  title: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  description?: string,
  teamId?: string,
  options?: IssueCreateOptions
): Promise<LinearIssue> {
  const effectiveTeamId = teamId ?? DEFAULT_TEAM_ID;

  const response = await fetchFn("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: CREATE_ISSUE_MUTATION,
      variables: {
        input: {
          title,
          teamId: effectiveTeamId,
          ...(description && { description }),
          ...(options?.projectId && { projectId: options.projectId }),
          ...(options?.stateId && { stateId: options.stateId }),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data: LinearResponse = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Linear GraphQL error: ${data.errors[0].message}`);
  }

  if (!data.data?.issueCreate.success || !data.data.issueCreate.issue) {
    throw new Error("Failed to create Linear issue");
  }

  return data.data.issueCreate.issue;
}
