/**
 * Shared prompts for AI-powered text processing.
 * Used by both telegram-webhook and create-issue functions.
 */

export const CLEANUP_PROMPT = `You are a text cleanup assistant. Clean up the following voice transcription by:
- Removing filler words (um, uh, like, you know, etc.)
- Fixing grammar and punctuation
- Preserving the original meaning and intent
- Keeping it concise
- IMPORTANT: Preserve any prefix tags at the start (e.g. "// fb - name - from name" or similar markers). Only fix typos in them, never remove them.
- Convert checkboxes to proper markdown format for Linear:
  - "[ ] task" → "- [ ] task"
  - "[x] task" → "- [x] task"
  - Ensure each checkbox item is on its own line
- Format bullet points as proper markdown (use "- " at line start)

Return ONLY the cleaned text, nothing else. Do not add any explanation or commentary.

Text to clean:`;
