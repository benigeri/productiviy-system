/**
 * Workflow label logic for email triage automation.
 * All operations are idempotent.
 */

import { WORKFLOW_LABELS, type WorkflowLabel } from "./nylas-types.ts";

const WORKFLOW_LABEL_SET = new Set<string>(WORKFLOW_LABELS.PRIORITY_ORDER);

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
 * Get the highest priority workflow label from a list.
 * Priority: to-respond-paul > to-read-paul > drafted
 * Returns null if no workflow labels found.
 */
export function getHighestPriorityLabel(
  labels: string[],
): WorkflowLabel | null {
  const workflowLabels = getWorkflowLabels(labels);
  if (workflowLabels.length === 0) {
    return null;
  }

  // Find the label with the lowest index in PRIORITY_ORDER (highest priority)
  let highestPriority: WorkflowLabel | null = null;
  let highestPriorityIndex = Infinity;

  for (const label of workflowLabels) {
    const index = WORKFLOW_LABELS.PRIORITY_ORDER.indexOf(label);
    if (index < highestPriorityIndex) {
      highestPriorityIndex = index;
      highestPriority = label;
    }
  }

  return highestPriority;
}
