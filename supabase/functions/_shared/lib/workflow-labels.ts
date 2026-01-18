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
 * Remove all workflow labels from a list of folders.
 */
export function removeWorkflowLabels(folders: string[]): string[] {
  return folders.filter((folder) => !isWorkflowLabel(folder));
}

