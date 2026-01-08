#!/usr/bin/env python3
"""
Email Canvas - Terminal panel display for email workflow.
Shows threads, single thread details, and drafts in a clean format.
"""

import argparse
import os
import sys
import warnings
from datetime import datetime

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


def clean_messages(message_ids: list[str]) -> list[dict]:
    """Fetch and clean multiple messages via Nylas Clean Messages API."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/messages/clean"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "message_id": message_ids,
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

    return response.json().get("data", [])


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
        if len(subject) > 50:
            subject = subject[:47] + "..."

        participants = t.get("participants", [])
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


def show_thread(thread_id: str, draft_text: str = None, thread_index: int = None, total_threads: int = None) -> None:
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

    # Get recipient info for reply
    from_list = latest.get("from", [])
    to_list = latest.get("to", [])
    cc_list = latest.get("cc", [])

    from_str = ", ".join(format_participant(p) for p in from_list)
    to_str = ", ".join(format_participant(p) for p in to_list)
    cc_str = ", ".join(format_participant(p) for p in cc_list) if cc_list else None

    date_str = format_date(latest.get("date", 0))
    body = latest.get("conversation", "") or latest.get("snippet", "")

    # Build thread position string
    position = ""
    if thread_index and total_threads:
        position = f" {thread_index}/{total_threads}:"

    print()
    print(double_line())

    if draft_text:
        # Abbreviated view when showing draft
        print(f"  📧 ORIGINAL:{position} {subject[:40]}...")
        print(f"  From: {from_list[0].get('name', 'Unknown') if from_list else 'Unknown'} | {date_str}")
        print(double_line())
        # Show abbreviated body
        abbrev_body = body.strip()[:200]
        if len(body.strip()) > 200:
            abbrev_body += "..."
        for line in abbrev_body.split("\n"):
            print(f"  {line}")
    else:
        # Full view
        print(f"  📧 Thread{position} {subject}")
        print(f"  From: {from_str}")
        print(f"  To: {to_str}")
        if cc_str:
            print(f"  CC: {cc_str}")
        print(f"  Date: {date_str} | {len(messages)} messages")
        print(double_line())
        print()
        # Show full body
        for line in body.strip().split("\n"):
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
        for line in draft_text.strip().split("\n"):
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
    parser.add_argument("--index", "-i", type=int, help="Thread index (e.g., 1 of 9)")
    parser.add_argument("--total", "-n", type=int, help="Total thread count")

    args = parser.parse_args()

    check_env()

    if args.thread_id:
        show_thread(args.thread_id, args.draft, args.index, args.total)
    else:
        list_threads()


if __name__ == "__main__":
    main()
