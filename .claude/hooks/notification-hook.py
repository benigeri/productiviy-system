#!/usr/bin/env python3
"""
Claude Code notification hook for push notifications via Poke.

This hook sends notifications when:
1. Claude is waiting for user input (Notification hook with idle_prompt)
2. Claude finishes a task (Stop hook)

Usage:
  As Notification hook: Receives JSON on stdin with notification details
  As Stop hook: Receives JSON on stdin with session context
  As command: python3 notification-hook.py "Title" "Body" [priority]
"""

import json
import os
import sys
import urllib.request
import urllib.error

# Read webhook URL from environment variable
POKE_WEBHOOK_URL = os.environ.get("POKE_WEBHOOK_URL", "")


def send_notification(title: str, body: str, priority: int = 0) -> None:
    """Send push notification via ntfy.sh webhook."""
    if not POKE_WEBHOOK_URL:
        print("⚠️  NTFY_URL not set, skipping notification", file=sys.stderr)
        return

    # ntfy.sh uses simple headers for title, priority, and tags
    # Priority: 1=min, 3=default, 5=max (we map 0->3, 1->5)
    ntfy_priority = "5" if priority == 1 else "3"

    try:
        req = urllib.request.Request(
            POKE_WEBHOOK_URL,
            data=body.encode("utf-8"),
            headers={
                "Title": title,
                "Priority": ntfy_priority,
                "Tags": "computer,gear",  # emoji tags
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print(f"✓ Notification sent: {title}", file=sys.stderr)
            else:
                print(f"⚠️  Notification failed: HTTP {response.status}", file=sys.stderr)
    except urllib.error.URLError as e:
        print(f"⚠️  Notification error: {e}", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  Unexpected error: {e}", file=sys.stderr)


def handle_notification_hook(data: dict) -> None:
    """Handle Notification hook (when Claude is idle/waiting for input)."""
    notification_type = data.get("notification_type", "")
    message = data.get("message", "")

    if notification_type == "idle_prompt":
        # Claude is waiting for user input
        send_notification(
            title="🤔 Claude waiting",
            body="Claude needs your input",
            priority=1,  # High priority
        )
    elif notification_type == "permission_prompt":
        # Claude needs permission for a tool
        send_notification(
            title="🔐 Permission needed",
            body=message or "Claude needs permission",
            priority=1,
        )
    else:
        # Other notification types
        send_notification(
            title="🔔 Claude notification",
            body=message or "Check your session",
            priority=0,
        )


def handle_stop_hook(data: dict) -> None:
    """Handle Stop hook (when Claude finishes responding)."""
    # Check if we're in a project directory
    cwd = data.get("cwd", "")
    project_name = os.path.basename(cwd) if cwd else "session"

    send_notification(
        title="✅ Claude finished",
        body=f"Task complete in {project_name}",
        priority=0,  # Normal priority
    )


def main() -> None:
    """Main hook entry point."""
    # Check if called with command-line arguments (direct usage)
    if len(sys.argv) > 1:
        title = sys.argv[1]
        body = sys.argv[2] if len(sys.argv) > 2 else ""
        priority = int(sys.argv[3]) if len(sys.argv) > 3 else 0
        send_notification(title, body, priority)
        return

    # Otherwise, read JSON from stdin (hook usage)
    try:
        hook_input = sys.stdin.read().strip()

        if not hook_input:
            return

        # Parse the hook payload
        data = json.loads(hook_input)
        hook_event = data.get("hook_event_name", "")

        if hook_event == "Notification":
            handle_notification_hook(data)
        elif hook_event == "Stop":
            handle_stop_hook(data)
        else:
            # Unknown hook type
            pass

    except json.JSONDecodeError:
        # Not JSON input, ignore
        pass
    except Exception as e:
        print(f"⚠️  Hook error: {e}", file=sys.stderr)
        sys.exit(1)  # Non-zero exit to signal error

    sys.exit(0)  # Always exit 0 to not block Claude


if __name__ == "__main__":
    main()
