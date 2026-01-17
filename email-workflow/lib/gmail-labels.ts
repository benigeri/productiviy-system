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

/**
 * Label for emails that have been drafted but not sent.
 * In Gmail, this is applied after a draft is saved.
 */
export function getLabelDrafted(): string {
  const labelId = process.env.GMAIL_LABEL_DRAFTED;
  if (!labelId) {
    throw new Error(
      'GMAIL_LABEL_DRAFTED environment variable is required. ' +
        'This should be the Gmail label ID for "drafted" emails (e.g., Label_215).'
    );
  }
  return labelId;
}

/**
 * Label for emails that need a response from Paul.
 * In Gmail, this is a filter-applied label for prioritization.
 */
export function getLabelToRespondPaul(): string {
  const labelId = process.env.GMAIL_LABEL_TO_RESPOND_PAUL;
  if (!labelId) {
    throw new Error(
      'GMAIL_LABEL_TO_RESPOND_PAUL environment variable is required. ' +
        'This should be the Gmail label ID for "to-respond-paul" emails (e.g., Label_139).'
    );
  }
  return labelId;
}

/**
 * Validate that all required Gmail label environment variables are set.
 * Call this at app startup to fail fast if misconfigured.
 */
export function validateGmailLabels(): void {
  getLabelDrafted();
  getLabelToRespondPaul();
}
