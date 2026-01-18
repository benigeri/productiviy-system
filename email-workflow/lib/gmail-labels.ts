/**
 * Gmail Label Configuration
 *
 * Gmail label IDs are unique per account. These must be configured
 * via environment variables for portability across accounts.
 *
 * To find your label IDs:
 * 1. Use the Nylas API to list labels: GET /v3/grants/{grant_id}/folders
 * 2. Find the label by name and use its 'id' field
 */

/** Get a required Gmail label ID from environment variables */
function getRequiredLabel(
  envVar: string,
  labelName: string,
  fallbackEnvVar?: string
): string {
  const labelId =
    process.env[envVar] ||
    (fallbackEnvVar ? process.env[fallbackEnvVar] : undefined);
  if (!labelId) {
    throw new Error(
      `${envVar} environment variable is required. ` +
        `This should be the Gmail label ID for "${labelName}" emails.`
    );
  }
  return labelId;
}

/** Label for emails that have been drafted but not sent. */
export const getLabelDrafted = () =>
  getRequiredLabel('GMAIL_LABEL_DRAFTED', 'wf_drafted');

/** Label for emails that need a response (highest priority). */
export const getLabelRespond = () =>
  getRequiredLabel(
    'GMAIL_LABEL_RESPOND',
    'wf_respond',
    'GMAIL_LABEL_TO_RESPOND_PAUL'
  );

/** Label for emails that need review (lower priority than respond). */
export const getLabelReview = () =>
  getRequiredLabel('GMAIL_LABEL_REVIEW', 'wf_review');

/**
 * Validate that all required Gmail label environment variables are set.
 * Call this at app startup to fail fast if misconfigured.
 */
export function validateGmailLabels(): void {
  getLabelDrafted();
  getLabelRespond();
  getLabelReview();
}
