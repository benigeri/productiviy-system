#!/usr/bin/env python3
"""
Email Canvas - Terminal panel display for email workflow.
Shows threads, single thread details, and drafts in a clean format.
"""

import argparse
import os
import sys
import textwrap
import unicodedata
import warnings
from typing import Dict, List, Optional

warnings.filterwarnings("ignore", message=".*OpenSSL.*")

# Import from shared library
# Add project root to path so email_utils can be imported regardless of cwd
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
import email_utils

# Label IDs
TO_RESPOND_LABEL = email_utils.LABEL_TO_RESPOND

PANEL_WIDTH = 100


def double_line(char="═"):
    """Print double line divider."""
    return char * PANEL_WIDTH


def single_line(char="─"):
    """Print single line divider."""
    return char * PANEL_WIDTH


# Box drawing characters
BOX_TOP_LEFT = "┌"
BOX_TOP_RIGHT = "┐"
BOX_BOTTOM_LEFT = "└"
BOX_BOTTOM_RIGHT = "┘"
BOX_HORIZONTAL = "─"
BOX_VERTICAL = "│"
BOX_LEFT_T = "├"
BOX_RIGHT_T = "┤"


def box_top(width: int = PANEL_WIDTH) -> str:
    """Return top border of a box."""
    return BOX_TOP_LEFT + BOX_HORIZONTAL * (width - 2) + BOX_TOP_RIGHT


def box_bottom(width: int = PANEL_WIDTH) -> str:
    """Return bottom border of a box."""
    return BOX_BOTTOM_LEFT + BOX_HORIZONTAL * (width - 2) + BOX_BOTTOM_RIGHT


def box_separator(width: int = PANEL_WIDTH) -> str:
    """Return horizontal separator within a box."""
    return BOX_LEFT_T + BOX_HORIZONTAL * (width - 2) + BOX_RIGHT_T


def display_width(text: str) -> int:
    """Calculate display width of text, accounting for wide characters like emojis."""
    width = 0
    for char in text:
        # East Asian Width: W (wide) and F (fullwidth) take 2 columns
        # Emojis are typically wide
        if unicodedata.east_asian_width(char) in ('W', 'F'):
            width += 2
        elif ord(char) >= 0x1F300:  # Emoji range starts around here
            width += 2
        else:
            width += 1
    return width


def box_line(text: str, width: int = PANEL_WIDTH) -> str:
    """Return a line of text within box borders, padded to width."""
    # Account for the two border characters
    inner_width = width - 4  # 2 for borders + 2 for padding spaces

    # Calculate display width (accounts for emojis/wide chars)
    text_display_width = display_width(text)

    # Truncate if too long (use display width for check)
    if text_display_width > inner_width:
        # Need to truncate carefully - can't just slice
        truncated = ""
        current_width = 0
        for char in text:
            char_width = 2 if (unicodedata.east_asian_width(char) in ('W', 'F') or ord(char) >= 0x1F300) else 1
            if current_width + char_width > inner_width - 3:
                break
            truncated += char
            current_width += char_width
        text = truncated + "..."
        text_display_width = display_width(text)

    # Pad to fill width (accounting for display width)
    padding_needed = inner_width - text_display_width
    padded = text + " " * padding_needed
    return f"{BOX_VERTICAL} {padded} {BOX_VERTICAL}"


def box_empty(width: int = PANEL_WIDTH) -> str:
    """Return an empty line within box borders."""
    return box_line("", width)


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
                # Use textwrap with break_long_words to prevent overflow
                wrapped = textwrap.fill(
                    line_text,
                    width=width,
                    break_long_words=True,
                    break_on_hyphens=True
                )
                wrapped_lines.append(wrapped)
            else:
                wrapped_lines.append("")  # PRESERVE blank lines
        if wrapped_lines:
            wrapped_paragraphs.append("\n".join(wrapped_lines))
    return "\n\n".join(wrapped_paragraphs)


def list_threads() -> None:
    """List all threads with to-respond-paul label."""
    threads = email_utils.nylas_get(f"/threads?in={TO_RESPOND_LABEL}&limit=20")

    if not threads:
        print()
        print(box_top())
        print(box_line("No emails to respond to"))
        print(box_bottom())
        return

    print()
    print(box_top())
    print(box_line(f"📧 EMAILS TO RESPOND ({len(threads)} threads)"))
    print(box_separator())

    for i, t in enumerate(threads, 1):
        subject = t.get("subject", "No subject")
        if len(subject) > 60:
            subject = subject[:57] + "..."

        latest = t.get("latest_draft_or_message", {})
        msg_count = len(t.get("message_ids", []))
        thread_id = t.get("id", "")

        # Get sender info
        from_list = latest.get("from", []) if latest else []
        from_p = from_list[0] if from_list else {}
        from_name = from_p.get("name", "Unknown")
        from_email = from_p.get("email", "")

        date_str = email_utils.format_date(latest.get("date", 0)) if latest else ""

        # Check if waiting on response (last message from Paul)
        is_waiting = "paul@archive.com" in from_email.lower()
        status = "⏳" if is_waiting else "📩"

        print(box_empty())
        print(box_line(f"{status} [{i}] {subject}"))
        print(box_line(f"   From: {from_name} | {date_str}"))
        print(box_line(f"   {msg_count} messages | ID: {thread_id[:20]}..."))

    print(box_empty())
    print(box_separator())
    print(box_line("Use --thread-id <ID> to view a thread"))
    print(box_bottom())


def format_message_box(msg: dict, msg_index: int, total_messages: int, is_latest: bool = False) -> list:
    """Format a single message as box lines.

    Args:
        msg: Message dict from Nylas
        msg_index: 1-based index of this message
        total_messages: Total messages in thread
        is_latest: Whether this is the most recent message

    Returns:
        List of formatted lines (without box borders)
    """
    from_list = msg.get("from", [])
    from_name = from_list[0].get("name", "") if from_list else ""
    from_email = from_list[0].get("email", "") if from_list else ""

    # Show name, or email if no name, or "Unknown" if both empty
    from_display = from_name if from_name and from_name != from_email else (from_email or "Unknown")

    date_str = email_utils.format_date(msg.get("date", 0))

    # Use conversation field from Clean Messages API (plain text, no HTML)
    body = msg.get("conversation", "") or msg.get("snippet", "")

    lines = []
    label = "📩 LATEST" if is_latest else f"[{msg_index}/{total_messages}]"
    lines.append(f"{label} From: {from_display} | {date_str}")
    lines.append("")

    # Wrap body text
    wrapped_body = wrap_text(body.strip(), width=PANEL_WIDTH - 6)
    for line in wrapped_body.split("\n"):
        lines.append(line)

    return lines


def show_thread(thread_id: str, draft_text: str = None, thread_index: int = None, total_threads: int = None,
                drafted_count: int = 0, skipped_count: int = 0) -> None:
    """Show single thread details with optional draft.

    Displays ALL messages in the thread with visual separation.
    Messages are sorted oldest to newest (most recent at bottom).
    """
    thread = email_utils.get_thread(thread_id)

    if not thread:
        print(f"Error: Thread not found: {thread_id}", file=sys.stderr)
        sys.exit(1)

    subject = thread.get("subject", "No subject")
    message_ids = thread.get("message_ids", [])

    if not message_ids:
        print("Error: Thread has no messages", file=sys.stderr)
        sys.exit(1)

    # Fetch and clean all messages (with markdown formatting)
    messages = email_utils.clean_messages(message_ids)
    if not messages:
        print("Error: Could not fetch messages", file=sys.stderr)
        sys.exit(1)

    # Sort by date (oldest first, newest last at bottom)
    messages = sorted(messages, key=lambda m: m.get("date", 0))
    latest = messages[-1]

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

    if draft_text:
        # Abbreviated view when showing draft - show only latest message summary
        from_list = latest.get("from", [])
        from_name = from_list[0].get("name", "Unknown") if from_list else "Unknown"
        date_str = email_utils.format_date(latest.get("date", 0))
        # Use conversation field from Clean Messages API (plain text, no HTML)
        body = latest.get("conversation", "") or latest.get("snippet", "")

        abbrev_subject = subject[:60] + "..." if len(subject) > 63 else subject
        print(box_top())
        print(box_line(f"📧 ORIGINAL:{position} {abbrev_subject}{progress}"))
        print(box_line(f"From: {from_name} | {date_str}"))
        print(box_separator())
        # Show abbreviated body
        abbrev_body = body.strip()[:300]
        if len(body.strip()) > 300:
            abbrev_body += "..."
        wrapped_body = wrap_text(abbrev_body, width=PANEL_WIDTH - 6)
        print(box_empty())
        for line in wrapped_body.split("\n"):
            print(box_line(line))
        print(box_empty())
        print(box_bottom())
    else:
        # Full view - THREAD box with ALL messages
        print(box_top())
        print(box_line(f"📧 Thread{position} {subject}{progress}"))
        print(box_line(f"{len(messages)} messages"))
        print(box_separator())

        # Display all messages with separators (oldest first, newest at bottom)
        for i, msg in enumerate(messages, 1):
            is_latest = (i == len(messages))
            msg_lines = format_message_box(msg, i, len(messages), is_latest)

            print(box_empty())
            for line in msg_lines:
                print(box_line(line))
            print(box_empty())

            # Add separator between messages (but not after the last one)
            if i < len(messages):
                print(box_separator())

        print(box_bottom())

    # Show draft if provided - YOUR DRAFT box
    if draft_text:
        print()
        print(box_top())
        print(box_line("✏️  YOUR DRAFT"))
        print(box_separator())
        print(box_empty())
        wrapped_draft = wrap_text(draft_text, width=PANEL_WIDTH - 6)
        for line in wrapped_draft.split("\n"):
            print(box_line(line))
        print(box_empty())
        print(box_separator())
        print(box_line('"approve" to save draft | give feedback to revise'))
        print(box_bottom())


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

    email_utils.check_env("NYLAS_API_KEY", "NYLAS_GRANT_ID")

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
