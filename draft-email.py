#!/usr/bin/env python3
"""
Email Draft Generator
Fetches an email thread from Nylas and generates a draft response using Anthropic.
"""

import argparse
import html
import os
import re
import sys
import warnings
from datetime import datetime

warnings.filterwarnings("ignore", message=".*OpenSSL.*")

import requests
from dotenv import load_dotenv

load_dotenv()

NYLAS_API_KEY = os.getenv("NYLAS_API_KEY")
NYLAS_GRANT_ID = os.getenv("NYLAS_GRANT_ID")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

NYLAS_BASE_URL = "https://api.us.nylas.com/v3"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def check_env():
    """Check required environment variables."""
    missing = []
    if not NYLAS_API_KEY:
        missing.append("NYLAS_API_KEY")
    if not NYLAS_GRANT_ID:
        missing.append("NYLAS_GRANT_ID")
    if not ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")

    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        print("Add them to your .env file")
        sys.exit(1)


def nylas_request(endpoint: str) -> dict:
    """Make a request to the Nylas API."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}{endpoint}"
    headers = {"Authorization": f"Bearer {NYLAS_API_KEY}"}

    response = requests.get(url, headers=headers)
    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}")
        sys.exit(1)

    return response.json().get("data", {})


def get_thread(thread_id: str) -> dict:
    """Fetch a thread by ID."""
    return nylas_request(f"/threads/{thread_id}")


def get_message(message_id: str) -> dict:
    """Fetch a message by ID with full body."""
    return nylas_request(f"/messages/{message_id}")


def html_to_text(html_content: str) -> str:
    """Convert HTML to plain text."""
    if not html_content:
        return ""

    # Remove style and script tags
    text = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)

    # Convert common elements
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?p[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?div[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<li[^>]*>', '\n- ', text, flags=re.IGNORECASE)

    # Remove all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Decode HTML entities
    text = html.unescape(text)

    # Clean up whitespace
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = re.sub(r' +', ' ', text)

    return text.strip()


def format_participant(participant: dict) -> str:
    """Format an email participant."""
    name = participant.get("name", "")
    email = participant.get("email", "")
    if name and name != email:
        return f"{name} <{email}>"
    return email


def format_message(msg: dict) -> str:
    """Format a message for the prompt."""
    from_list = msg.get("from", [])
    to_list = msg.get("to", [])
    cc_list = msg.get("cc", [])
    date_ts = msg.get("date", 0)
    subject = msg.get("subject", "(no subject)")
    body = msg.get("body", "") or msg.get("snippet", "")

    # Format date
    date_str = datetime.fromtimestamp(date_ts).strftime("%Y-%m-%d %H:%M") if date_ts else "Unknown"

    # Format participants
    from_str = ", ".join(format_participant(p) for p in from_list)
    to_str = ", ".join(format_participant(p) for p in to_list)

    # Build message
    lines = [
        f"From: {from_str}",
        f"To: {to_str}",
    ]
    if cc_list:
        cc_str = ", ".join(format_participant(p) for p in cc_list)
        lines.append(f"Cc: {cc_str}")
    lines.extend([
        f"Date: {date_str}",
        f"Subject: {subject}",
        "",
        html_to_text(body),
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


DRAFT_PROMPT = """You are an email assistant helping to draft a response to an email thread.

Review the email thread below and draft a professional, helpful response to the most recent message.

Guidelines:
- Match the tone and formality of the conversation
- Be concise but complete
- Address all questions or requests in the most recent message
- If more information is needed to respond properly, note what's missing
- Do not include a subject line (it will be auto-generated as Re: ...)
- Start directly with the greeting or response content

Return ONLY the draft email body, nothing else.

"""


def generate_draft(thread_content: str) -> str:
    """Generate a draft response using Anthropic."""
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2048,
        "messages": [
            {
                "role": "user",
                "content": f"{DRAFT_PROMPT}{thread_content}",
            }
        ],
    }

    response = requests.post(ANTHROPIC_URL, headers=headers, json=payload)

    if not response.ok:
        print(f"Anthropic API error: {response.status_code} {response.text}")
        sys.exit(1)

    data = response.json()
    content = data.get("content", [])

    if not content or content[0].get("type") != "text":
        print("Error: Unexpected response structure from Anthropic")
        sys.exit(1)

    return content[0]["text"]


def main():
    parser = argparse.ArgumentParser(
        description="Generate an email draft response using AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s THREAD_ID              # Draft response for a thread
  %(prog)s THREAD_ID --verbose    # Show thread content before draft
        """,
    )
    parser.add_argument("thread_id", help="Nylas thread ID to respond to")
    parser.add_argument("-v", "--verbose", action="store_true", help="Show thread content")

    args = parser.parse_args()

    check_env()

    # Fetch thread
    thread = get_thread(args.thread_id)
    if not thread:
        print(f"Error: Thread not found: {args.thread_id}")
        sys.exit(1)

    # Fetch all messages in thread
    message_ids = thread.get("message_ids", [])
    if not message_ids:
        print("Error: Thread has no messages")
        sys.exit(1)

    messages = []
    for msg_id in message_ids:
        msg = get_message(msg_id)
        if msg:
            messages.append(msg)

    if not messages:
        print("Error: Could not fetch any messages")
        sys.exit(1)

    # Format thread
    thread_content = format_thread(thread, messages)

    if args.verbose:
        print(thread_content)
        print("\n" + "=" * 50)
        print("GENERATED DRAFT:")
        print("=" * 50 + "\n")

    # Generate draft
    draft = generate_draft(thread_content)
    print(draft)


if __name__ == "__main__":
    main()
