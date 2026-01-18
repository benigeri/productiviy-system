/**
 * Email classifier using Braintrust.
 * Calls the email-classifier-v1 prompt to categorize emails into ai_* labels.
 */

// Classifier input - matches the Braintrust prompt variables
export interface ClassifierInput {
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  body: string;
}

// Classifier output - matches the structured output schema
export interface ClassifierResult {
  labels: string[];
  reason: string;
}

/**
 * Validate and parse classifier output from Braintrust.
 * Handles both JSON strings and objects.
 */
export function parseClassifierResult(result: unknown): ClassifierResult {
  // Default empty result
  const defaultResult: ClassifierResult = { labels: [], reason: "Parse failed" };

  if (!result) {
    return defaultResult;
  }

  // Parse JSON string if needed
  let parsed: unknown = result;
  if (typeof result === "string") {
    try {
      parsed = JSON.parse(result);
    } catch {
      console.error("Failed to parse classifier JSON:", result);
      return defaultResult;
    }
  }

  // Validate structure
  if (typeof parsed !== "object" || parsed === null) {
    return defaultResult;
  }

  const { labels, reason } = parsed as Record<string, unknown>;

  // Validate labels is array of strings starting with ai_
  if (!Array.isArray(labels)) {
    return { ...defaultResult, reason: "Invalid labels array" };
  }

  const validLabels = labels.filter(
    (l): l is string => typeof l === "string" && l.startsWith("ai_")
  );

  return {
    labels: validLabels,
    reason: typeof reason === "string" ? reason : "No reason provided",
  };
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classify an email using Braintrust with retries.
 */
export async function classifyEmail(
  input: ClassifierInput,
  deps: {
    invoke: (params: {
      projectName: string;
      slug: string;
      input: ClassifierInput;
    }) => Promise<unknown>;
    projectName: string;
    classifierSlug: string;
  },
  maxRetries = 2
): Promise<ClassifierResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await deps.invoke({
        projectName: deps.projectName,
        slug: deps.classifierSlug,
        input,
      });
      return parseClassifierResult(result);
    } catch (error) {
      console.error(`Classification attempt ${attempt + 1} failed:`, error);
      if (attempt === maxRetries) {
        return { labels: [], reason: "Classification failed after retries" };
      }
      // Exponential backoff: 100ms, 200ms
      await sleep(Math.pow(2, attempt) * 100);
    }
  }
  return { labels: [], reason: "Classification failed" };
}
