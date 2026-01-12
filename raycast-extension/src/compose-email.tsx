import { useState } from "react";
import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Clipboard,
  popToRoot,
  getPreferenceValues,
  open,
} from "@raycast/api";

// P2 #2: TypeScript interfaces for API responses
interface ComposeResponse {
  subject: string;
  to: string[];
  cc?: string[];
  body: string;
}

interface SaveResponse {
  draftId: string;
}

interface ApiError {
  error?: string;
}

interface Preferences {
  emailApiBaseUrl: string;
}

// P3 #8: Input length validation
const MAX_INSTRUCTIONS_LENGTH = 5000;
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds for LLM calls

export default function Command() {
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // P2 #3: Get API URL from preferences
  const { emailApiBaseUrl } = getPreferenceValues<Preferences>();
  const COMPOSE_API = `${emailApiBaseUrl}/api/compose`;
  const SAVE_API = `${emailApiBaseUrl}/api/compose/save`;

  async function handleSubmit() {
    const trimmedInstructions = instructions.trim();

    if (!trimmedInstructions) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Instructions required",
        message: "Please enter what you want to email about",
      });
      return;
    }

    // P3 #8: Frontend input length validation
    if (trimmedInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Instructions too long",
        message: `Maximum ${MAX_INSTRUCTIONS_LENGTH} characters allowed`,
      });
      return;
    }

    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Generating draft...",
    });

    // P2 #4: AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const composeRes = await fetch(COMPOSE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: trimmedInstructions }),
        signal: controller.signal,
      });

      // P2 #5: Parse JSON once, use for both error check and data
      const composeData = await composeRes.json();

      if (!composeRes.ok) {
        throw new Error(
          (composeData as ApiError).error || "Failed to generate email",
        );
      }

      const { subject, to, cc, body } = composeData as ComposeResponse;

      toast.title = "Saving to Gmail...";

      const saveRes = await fetch(SAVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, draftBody: body, to, cc }),
        signal: controller.signal,
      });

      const saveData = await saveRes.json();

      if (!saveRes.ok) {
        throw new Error((saveData as ApiError).error || "Failed to save draft");
      }

      const { draftId } = saveData as SaveResponse;
      const draftUrl = `https://mail.google.com/mail/u/0/#drafts/${draftId}`;

      clearTimeout(timeoutId);

      await Clipboard.copy(draftUrl);
      toast.style = Toast.Style.Success;
      toast.title = "Draft saved!";
      toast.message = `${subject} (URL copied)`;

      // P3 #7: Add toast primaryAction to open in Gmail
      toast.primaryAction = {
        title: "Open in Gmail",
        onAction: () => open(draftUrl),
      };

      setInstructions("");
      await popToRoot();
    } catch (error) {
      clearTimeout(timeoutId);

      toast.style = Toast.Style.Failure;

      if (error instanceof Error && error.name === "AbortError") {
        toast.title = "Request timed out";
        toast.message = "The server took too long to respond";
      } else {
        toast.title = "Failed";
        toast.message =
          error instanceof Error ? error.message : "Unknown error";
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Draft" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="instructions"
        title="Instructions"
        placeholder="Email john@example.com about Q1 results"
        value={instructions}
        onChange={setInstructions}
      />
      <Form.Description
        title="Tip"
        text="Include recipient email and what you want to say. AI will generate the draft."
      />
    </Form>
  );
}
