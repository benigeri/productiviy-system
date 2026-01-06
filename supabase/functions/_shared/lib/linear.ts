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

export async function createTriageIssue(
  title: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  description?: string,
  teamId?: string
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
