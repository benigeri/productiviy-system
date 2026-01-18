/**
 * Workflow label logic for email triage automation.
 * Workflow labels are mutually exclusive - only one should be active at a time.
 * All operations are idempotent.
 */

import { WORKFLOW_LABELS, type WorkflowLabel } from "./nylas-types.ts";

const WORKFLOW_LABEL_SET = new Set<string>(WORKFLOW_LABELS.ALL);

/**
 * Check if a folder/label is a workflow label.
 */
export function isWorkflowLabel(folder: string): folder is WorkflowLabel {
  return WORKFLOW_LABEL_SET.has(folder);
}

/**
 * Extract workflow labels from a list of folders.
 * Preserves order from input.
 */
export function getWorkflowLabels(folders: string[]): WorkflowLabel[] {
  return folders.filter(isWorkflowLabel);
}

/**
 * Remove workflow labels from a list of folders.
 * Optionally keep one specific label.
 */
export function removeWorkflowLabels(
  folders: string[],
  keepLabel?: WorkflowLabel,
): string[] {
  return folders.filter(
    (folder) => !isWorkflowLabel(folder) || folder === keepLabel,
  );
}

/**
 * Get the most recently added workflow label (last in array).
 * Gmail/Nylas typically appends new labels to the end.
 * Returns null if no workflow labels found.
 */
export function getMostRecentWorkflowLabel(
  folders: string[],
): WorkflowLabel | null {
  const workflowLabels = getWorkflowLabels(folders);
  if (workflowLabels.length === 0) {
    return null;
  }
  // Return the last one (most recently added)
  return workflowLabels[workflowLabels.length - 1];
}
