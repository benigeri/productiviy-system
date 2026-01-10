#!/usr/bin/env python3
"""
Email Draft Generator
Fetches an email thread from Nylas and generates a draft response using Anthropic.
"""

import argparse
import json
import os
import sys
import warnings
from datetime import datetime
from typing import Optional

warnings.filterwarnings("ignore", message=".*OpenSSL.*")

import requests

# Import from shared library
import email_utils

# Get config from email_utils
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_TIMEOUT = 60  # seconds (longer for LLM generation)

# Paths relative to project root
GUIDELINES_PATH = ".claude/skills/email-respond/email-writing-guidelines.md"
PAUL_EMAILS_PATH = ".claude/skills/email-respond/paul-emails.txt"


def format_message(msg: dict) -> str:
    """Format a message for the prompt. Expects cleaned message from Nylas Clean Messages API."""
    from_list = msg.get("from", [])
    to_list = msg.get("to", [])
    cc_list = msg.get("cc", [])
    date_ts = msg.get("date", 0)
    subject = msg.get("subject", "(no subject)")
    # Use 'conversation' field from Clean Messages API (plain text)
    body = msg.get("conversation", "") or msg.get("snippet", "")

    # Format date
    date_str = datetime.fromtimestamp(date_ts).strftime("%Y-%m-%d %H:%M") if date_ts else "Unknown"

    # Format participants using email_utils
    from_str = ", ".join(email_utils.format_participant(p) for p in from_list)
    to_str = ", ".join(email_utils.format_participant(p) for p in to_list)

    # Build message
    lines = [
        f"From: {from_str}",
        f"To: {to_str}",
    ]
    if cc_list:
        cc_str = ", ".join(email_utils.format_participant(p) for p in cc_list)
        lines.append(f"Cc: {cc_str}")
    lines.extend([
        f"Date: {date_str}",
        f"Subject: {subject}",
        "",
        body.strip(),
    ])

    return "\n".join(lines)


def format_thread(thread: dict, messages: list[dict]) -> str:
    """Format a full thread for the prompt."""
    # Sort messages by date (oldest first)
    sorted_msgs = sorted(messages, key=lambda m: m.get("date", 0))

    parts = [f"=== Email Thread: {thread.get('subject', '(no subject)')} ===\n"]

    for i, msg in enumerate(sorted_msgs, 1):
        parts.append(f"--- Message {i} of {len(sorted_msgs)} ---")
        parts.append(format_message(msg))
        parts.append("")

    return "\n".join(parts)


def load_file(relative_path: str) -> Optional[str]:
    """Load a file relative to the script directory."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, relative_path)

    if os.path.exists(file_path):
        with open(file_path, encoding="utf-8") as f:
            return f.read()
    return None


def load_guidelines() -> str:
    """Load email writing guidelines from file."""
    content = load_file(GUIDELINES_PATH)
    if content:
        return content

    # Fallback to default prompt if file not found
    return """You are an email assistant helping to draft a response to an email thread.
Match the tone and formality of the conversation. Be concise but complete.
Return a JSON object with to, cc, subject, and body fields."""


def load_paul_emails() -> Optional[str]:
    """Load Paul's example emails for style reference."""
    return load_file(PAUL_EMAILS_PATH)


def get_draft_prompt(thread_content: str, dictation: str) -> str:
    """Build the full prompt with guidelines, examples, thread, and dictation."""
    guidelines = load_guidelines()
    paul_emails = load_paul_emails()

    parts = [guidelines]

    if paul_emails:
        parts.append("\n---\n\n## paul-emails.txt (Reference Examples)\n")
        parts.append(paul_emails)

    parts.append("\n---\n\n## Email Thread to Respond To\n")
    parts.append(thread_content)

    parts.append("\n---\n\n## User's Dictation\n")
    parts.append("The user wants to respond with this intent. ")
    parts.append("Capture their key points while writing in Paul's voice.\n\n")
    parts.append("Note: The dictation may contain transcription artifacts such as ")
    parts.append("repeated words (\"bye bye bye\"), filler words (\"um\", \"uh\"), ")
    parts.append("or trailing noise. Ignore these artifacts and do not include them in the draft.\n\n")
    parts.append(dictation)

    return "\n".join(parts)


def call_anthropic(messages: list) -> str:
    """Make a request to the Anthropic API with given messages."""
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2048,
        "messages": messages,
    }

    try:
        response = requests.post(ANTHROPIC_URL, headers=headers, json=payload, timeout=ANTHROPIC_TIMEOUT)
    except requests.RequestException as e:
        print(f"Anthropic request failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Anthropic API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    data = response.json()
    content = data.get("content", [])

    if not content or content[0].get("type") != "text":
        print("Error: Unexpected response structure from Anthropic", file=sys.stderr)
        sys.exit(1)

    return content[0]["text"]


def generate_draft(thread_content: str, dictation: str) -> str:
    """Generate a draft response using Anthropic."""
    prompt = get_draft_prompt(thread_content, dictation)
    messages = [{"role": "user", "content": prompt}]
    return call_anthropic(messages)


def generate_with_feedback(
    thread_content: str, dictation: str, previous_draft: str, feedback: str
) -> str:
    """Generate a revised draft based on user feedback.

    Uses multi-turn conversation to preserve context from the original generation.
    """
    initial_prompt = get_draft_prompt(thread_content, dictation)
    messages = [
        {"role": "user", "content": initial_prompt},
        {"role": "assistant", "content": previous_draft},
        {"role": "user", "content": f"Please revise the draft based on this feedback:\n\n{feedback}"},
    ]
    return call_anthropic(messages)


def parse_draft_response(response: str) -> dict:
    """Parse the JSON response from the AI."""
    try:
        return json.loads(response.strip())
    except json.JSONDecodeError:
        # If JSON parsing fails, return the raw text as body
        return {"body": response, "to": [], "cc": [], "subject": ""}


def main():
    parser = argparse.ArgumentParser(
        description="Generate an email draft response using AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s THREAD_ID -d "Let's meet Tuesday at 2pm"
  %(prog)s THREAD_ID -d "Yes, sounds good" --body-only
  %(prog)s THREAD_ID -d "..." -o /tmp/draft.json
  %(prog)s THREAD_ID -d "..." --feedback "Make it shorter" --previous-draft /tmp/draft.json -o /tmp/draft.json

Note: Use -o/--output instead of shell redirection (>) when iterating on drafts.
      This allows safe use of the same file for input and output.
        """,
    )
    parser.add_argument("thread_id", help="Nylas thread ID to respond to")
    parser.add_argument(
        "-d", "--dictation", required=True,
        help="User's dictation of what they want to say in the response"
    )
    parser.add_argument(
        "-f", "--feedback",
        help="Feedback on previous draft (requires --previous-draft)"
    )
    parser.add_argument(
        "--previous-draft",
        help="Path to previous draft JSON file (for feedback iterations)"
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Show thread content")
    parser.add_argument("--body-only", action="store_true", help="Output only the email body")
    parser.add_argument(
        "-o", "--output",
        help="Output file path (uses atomic write, safe to use same file as --previous-draft)"
    )

    args = parser.parse_args()

    # Validate feedback arguments
    if args.feedback and not args.previous_draft:
        print("Error: --feedback requires --previous-draft", file=sys.stderr)
        sys.exit(1)
    if args.previous_draft and not args.feedback:
        print("Error: --previous-draft requires --feedback", file=sys.stderr)
        sys.exit(1)

    # Validate previous draft file early (before API calls)
    previous_draft_json = None
    if args.feedback:
        try:
            with open(args.previous_draft, encoding="utf-8") as f:
                previous_draft_json = f.read()
        except FileNotFoundError:
            print(f"Error: Previous draft file not found: {args.previous_draft}", file=sys.stderr)
            sys.exit(1)
        except IOError as e:
            print(f"Error reading previous draft: {e}", file=sys.stderr)
            sys.exit(1)

        # Validate previous draft content is not empty
        if not previous_draft_json or not previous_draft_json.strip():
            print("Error: Previous draft file is empty", file=sys.stderr)
            sys.exit(1)

        # Validate feedback is not empty
        if not args.feedback.strip():
            print("Error: Feedback cannot be empty", file=sys.stderr)
            sys.exit(1)

    email_utils.check_env("NYLAS_API_KEY", "NYLAS_GRANT_ID", "ANTHROPIC_API_KEY")

    # Fetch thread
    thread = email_utils.get_thread(args.thread_id)
    if not thread:
        print(f"Error: Thread not found: {args.thread_id}", file=sys.stderr)
        sys.exit(1)

    # Get message IDs from thread
    message_ids = thread.get("message_ids", [])
    if not message_ids:
        print("Error: Thread has no messages", file=sys.stderr)
        sys.exit(1)

    # Fetch and clean all messages in one API call
    messages = email_utils.clean_messages(message_ids)
    if not messages:
        print("Error: Could not fetch any messages", file=sys.stderr)
        sys.exit(1)

    # Format thread
    thread_content = format_thread(thread, messages)

    if args.verbose:
        print(thread_content, file=sys.stderr)
        print("\n" + "=" * 50, file=sys.stderr)
        print("GENERATED DRAFT:", file=sys.stderr)
        print("=" * 50 + "\n", file=sys.stderr)

    # Generate draft (with or without feedback)
    if args.feedback:
        # previous_draft_json was already loaded and validated earlier
        raw_response = generate_with_feedback(
            thread_content, args.dictation, previous_draft_json, args.feedback
        )
    else:
        raw_response = generate_draft(thread_content, args.dictation)

    draft = parse_draft_response(raw_response)
    draft = email_utils.normalize_draft(draft)

    # Format output
    if args.body_only:
        output_content = draft.get("body", raw_response)
    else:
        output_content = json.dumps(draft, indent=2)

    # Write to file or stdout
    if args.output:
        email_utils.atomic_write(args.output, output_content + "\n")
    else:
        print(output_content)


if __name__ == "__main__":
    main()
