#!/usr/bin/env python3
"""
Email Canvas - Terminal panel display for email workflow.
Shows threads, single thread details, and drafts in a clean format.
"""

import argparse
import os
import re
import sys
import textwrap
import warnings
from datetime import datetime
from html import unescape
from typing import Dict, List, Optional

warnings.filterwarnings("ignore", message=".*OpenSSL.*")

import requests
from dotenv import load_dotenv

load_dotenv()

NYLAS_API_KEY = os.getenv("NYLAS_API_KEY")
NYLAS_GRANT_ID = os.getenv("NYLAS_GRANT_ID")
NYLAS_BASE_URL = "https://api.us.nylas.com/v3"

# Label IDs
TO_RESPOND_LABEL = "Label_139"  # to-respond-paul

REQUEST_TIMEOUT = 30
PANEL_WIDTH = 62


def check_env():
    """Check required environment variables."""
    missing = []
    if not NYLAS_API_KEY:
        missing.append("NYLAS_API_KEY")
    if not NYLAS_GRANT_ID:
        missing.append("NYLAS_GRANT_ID")
    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)


def nylas_get(endpoint: str) -> dict:
    """Make a GET request to the Nylas API."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}{endpoint}"
    headers = {"Authorization": f"Bearer {NYLAS_API_KEY}"}

    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Nylas request failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    return response.json().get("data", {})


def clean_messages(message_ids: List[str]) -> List[Dict]:
    """Fetch and clean multiple messages via Nylas Clean Messages API.

    Nylas limits batch requests to 20 message IDs, so we batch if needed.
    """
    BATCH_SIZE = 20
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/messages/clean"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }

    all_messages = []

    # Batch message IDs into chunks of 20 (Nylas API limit)
    for i in range(0, len(message_ids), BATCH_SIZE):
        batch = message_ids[i:i + BATCH_SIZE]
        payload = {
            "message_id": batch,
            "ignore_images": True,
            "ignore_links": True,
        }

        try:
            response = requests.put(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as e:
            print(f"Nylas request failed: {e}", file=sys.stderr)
            sys.exit(1)

        if not response.ok:
            print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
            sys.exit(1)

        all_messages.extend(response.json().get("data", []))

    return all_messages


def format_date(timestamp: int) -> str:
    """Format Unix timestamp to readable date."""
    if not timestamp:
        return "Unknown"
    return datetime.fromtimestamp(timestamp).strftime("%b %d, %I:%M %p")


def format_participant(p: dict) -> str:
    """Format email participant."""
    name = p.get("name", "")
    email = p.get("email", "")
    if name and name != email:
        return f"{name} <{email}>"
    return email


def double_line(char="═"):
    """Print double line divider."""
    return char * PANEL_WIDTH


def single_line(char="─"):
    """Print single line divider."""
    return char * PANEL_WIDTH


def wrap_text(text: str, width: int = PANEL_WIDTH - 4) -> str:
    """Wrap text to fit panel width, preserving paragraph breaks."""
    # Split on double newlines for paragraph breaks
    paragraphs = text.strip().split("\n\n")
    wrapped_paragraphs = []
    for para in paragraphs:
        # Handle single newlines within paragraphs as line breaks
        lines = para.split("\n")
        wrapped_lines = []
        for line in lines:
            line_text = " ".join(line.split())
            if line_text:
                wrapped = textwrap.fill(line_text, width=width)
                wrapped_lines.append(wrapped)
        if wrapped_lines:
            wrapped_paragraphs.append("\n".join(wrapped_lines))
    return "\n\n".join(wrapped_paragraphs)


def html_to_text(html: str) -> str:
    """Convert HTML to plain text while preserving paragraph structure."""
    if not html:
        return ""

    # Replace block elements with newlines to preserve structure
    text = re.sub(r"</div>\s*<div", "</div>\n<div", html, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>\s*", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</div>\s*", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</li>\s*", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</tr>\s*", "\n", text, flags=re.IGNORECASE)

    # Remove all remaining HTML tags
    text = re.sub(r"<[^>]+>", "", text)

    # Decode HTML entities
    text = unescape(text)

    # Remove zero-width spaces and other invisible Unicode characters
    text = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", text)

    # Normalize whitespace within lines (but preserve newlines)
    lines = text.split("\n")
    lines = [" ".join(line.split()) for line in lines]
    text = "\n".join(lines)

    # Collapse multiple blank lines into double newlines (paragraph breaks)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Strip leading/trailing whitespace
    text = text.strip()

    return text


def list_threads() -> None:
    """List all threads with to-respond-paul label."""
    threads = nylas_get(f"/threads?in={TO_RESPOND_LABEL}&limit=20")

    if not threads:
        print()
        print(double_line())
        print("  No emails to respond to")
        print(double_line())
        return

    print()
    print(double_line())
    print(f"  📧 EMAILS TO RESPOND ({len(threads)} threads)")
    print(double_line())
    print()

    for i, t in enumerate(threads, 1):
        subject = t.get("subject", "No subject")
        if len(subject) > 45:
            subject = subject[:42] + "..."

        latest = t.get("latest_draft_or_message", {})
        msg_count = len(t.get("message_ids", []))
        thread_id = t.get("id", "")

        # Get sender info
        from_list = latest.get("from", []) if latest else []
        from_p = from_list[0] if from_list else {}
        from_name = from_p.get("name", "Unknown")
        from_email = from_p.get("email", "")

        date_str = format_date(latest.get("date", 0)) if latest else ""

        # Check if waiting on response (last message from Paul)
        is_waiting = "paul@archive.com" in from_email.lower()
        status = "⏳" if is_waiting else "📩"

        print(f"  {status} [{i}] {subject}")
        print(f"     From: {from_name}")
        print(f"     Date: {date_str} | {msg_count} messages")
        print(f"     ID: {thread_id}")
        print()

    print(double_line())
    print("  Use --thread-id <ID> to view a thread")
    print(double_line())


def show_thread(thread_id: str, draft_text: str = None, thread_index: int = None, total_threads: int = None,
                drafted_count: int = 0, skipped_count: int = 0) -> None:
    """Show single thread details with optional draft."""
    thread = nylas_get(f"/threads/{thread_id}")

    if not thread:
        print(f"Error: Thread not found: {thread_id}", file=sys.stderr)
        sys.exit(1)

    subject = thread.get("subject", "No subject")
    message_ids = thread.get("message_ids", [])

    if not message_ids:
        print("Error: Thread has no messages", file=sys.stderr)
        sys.exit(1)

    # Fetch and clean all messages
    messages = clean_messages(message_ids)
    if not messages:
        print("Error: Could not fetch messages", file=sys.stderr)
        sys.exit(1)

    # Sort by date (newest last)
    messages = sorted(messages, key=lambda m: m.get("date", 0))
    latest = messages[-1]
    latest_id = latest.get("id", message_ids[-1])

    # Fetch latest message directly to get HTML body (clean_messages doesn't include it)
    latest_full = nylas_get(f"/messages/{latest_id}")

    # Get recipient info for reply
    from_list = latest.get("from", [])
    to_list = latest.get("to", [])
    cc_list = latest.get("cc", [])

    from_str = ", ".join(format_participant(p) for p in from_list)
    to_str = ", ".join(format_participant(p) for p in to_list)
    cc_str = ", ".join(format_participant(p) for p in cc_list) if cc_list else None

    date_str = format_date(latest.get("date", 0))
    # Use HTML body and convert to text to preserve paragraph structure
    # The 'conversation' field loses formatting; 'body' has HTML with structure
    html_body = latest_full.get("body", "") if latest_full else ""
    body = html_to_text(html_body) if html_body else latest.get("snippet", "")

    # Build thread position string
    position = ""
    if thread_index and total_threads:
        position = f" {thread_index}/{total_threads}:"

    # Build progress string
    progress = ""
    if drafted_count > 0 or skipped_count > 0:
        parts = []
        if drafted_count > 0:
            parts.append(f"{drafted_count} drafted")
        if skipped_count > 0:
            parts.append(f"{skipped_count} skipped")
        progress = f"  [{', '.join(parts)}]"

    print()
    print(double_line())

    if draft_text:
        # Abbreviated view when showing draft
        abbrev_subject = subject[:42] + "..." if len(subject) > 45 else subject
        print(f"  📧 ORIGINAL:{position} {abbrev_subject}{progress}")
        print(f"  From: {from_list[0].get('name', 'Unknown') if from_list else 'Unknown'} | {date_str}")
        print(double_line())
        # Show abbreviated body
        abbrev_body = body.strip()[:200]
        if len(body.strip()) > 200:
            abbrev_body += "..."
        wrapped_body = wrap_text(abbrev_body)
        for line in wrapped_body.split("\n"):
            print(f"  {line}")
    else:
        # Full view
        print(f"  📧 Thread{position} {subject}{progress}")
        print(f"  From: {from_str}")
        print(f"  To: {to_str}")
        if cc_str:
            print(f"  CC: {cc_str}")
        print(f"  Date: {date_str} | {len(messages)} messages")
        print(double_line())
        print()
        # Show full body with word wrapping
        wrapped_body = wrap_text(body)
        for line in wrapped_body.split("\n"):
            print(f"  {line}")
        print()
        print(single_line())
        print("  Scroll up for earlier messages")
        print(single_line())

    # Show draft if provided
    if draft_text:
        print()
        print(double_line())
        print("  ✏️  YOUR DRAFT")
        print(double_line())
        print()
        wrapped_draft = wrap_text(draft_text)
        for line in wrapped_draft.split("\n"):
            print(f"  {line}")
        print()
        print(single_line())
        print('  "approve" to save draft | give feedback to revise')
        print(single_line())


def main():
    parser = argparse.ArgumentParser(
        description="Email canvas - terminal panel for email workflow",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          # List all threads to respond
  %(prog)s --thread-id ID           # Show single thread
  %(prog)s --thread-id ID --draft "text"  # Show thread with draft
        """,
    )
    parser.add_argument("--thread-id", "-t", help="Thread ID to display")
    parser.add_argument("--draft", "-d", help="Draft text to display below thread")
    parser.add_argument("--draft-file", help="Read draft text from file (avoids shell quoting issues)")
    parser.add_argument("--index", "-i", type=int, help="Thread index (e.g., 1 of 9)")
    parser.add_argument("--total", "-n", type=int, help="Total thread count")
    parser.add_argument("--drafted", type=int, default=0, help="Number of drafts created so far")
    parser.add_argument("--skipped", type=int, default=0, help="Number of threads skipped so far")

    args = parser.parse_args()

    check_env()

    # Load draft from file if specified
    draft_text = args.draft
    if args.draft_file:
        try:
            with open(args.draft_file, encoding="utf-8") as f:
                draft_text = f.read().strip()
        except FileNotFoundError:
            print(f"Error: Draft file not found: {args.draft_file}", file=sys.stderr)
            sys.exit(1)
        except IOError as e:
            print(f"Error reading draft file: {e}", file=sys.stderr)
            sys.exit(1)

    if (args.draft or args.draft_file) and not args.thread_id:
        print("Error: --draft requires --thread-id", file=sys.stderr)
        sys.exit(1)

    if args.thread_id:
        show_thread(args.thread_id, draft_text, args.index, args.total, args.drafted, args.skipped)
    else:
        list_threads()


if __name__ == "__main__":
    main()
