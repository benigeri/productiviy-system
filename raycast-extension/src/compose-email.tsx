import { useState } from "react";
import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Clipboard,
  popToRoot,
} from "@raycast/api";

const COMPOSE_API = "https://email-workflow-phi.vercel.app/api/compose";
const SAVE_API = "https://email-workflow-phi.vercel.app/api/compose/save";

export default function Command() {
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit() {
    if (!instructions.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Instructions required",
      });
      return;
    }

    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Generating draft...",
    });

    try {
      // Step 1: Generate email
      const composeRes = await fetch(COMPOSE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });

      if (!composeRes.ok) {
        const error = await composeRes.json();
        throw new Error(error.error || "Failed to generate email");
      }

      const { subject, to, cc, body } = await composeRes.json();

      // Step 2: Save to Gmail
      const saveRes = await fetch(SAVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, draftBody: body, to, cc }),
      });

      if (!saveRes.ok) {
        const error = await saveRes.json();
        throw new Error(error.error || "Failed to save draft");
      }

      const { draftId } = await saveRes.json();
      const draftUrl = `https://mail.google.com/mail/u/0/#drafts/${draftId}`;

      // Success
      await Clipboard.copy(draftUrl);
      toast.style = Toast.Style.Success;
      toast.title = "Draft saved!";
      toast.message = `${subject} (URL copied)`;

      setInstructions("");
      await popToRoot();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
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
    </Form>
  );
}
