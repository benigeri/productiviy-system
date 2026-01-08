#!/usr/bin/env python3
"""
Create Gmail Draft via Nylas API

Takes a draft JSON file and creates a Gmail draft. Handles all the shell quoting
issues by reading from files instead of command line interpolation.
"""

import argparse
import json
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

NYLAS_API_KEY = os.getenv("NYLAS_API_KEY")
NYLAS_GRANT_ID = os.getenv("NYLAS_GRANT_ID")
NYLAS_BASE_URL = "https://api.us.nylas.com/v3"
REQUEST_TIMEOUT = 30


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


def get_thread(thread_id: str) -> dict:
    """Fetch thread to get latest message ID."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/threads/{thread_id}"
    headers = {"Authorization": f"Bearer {NYLAS_API_KEY}"}

    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error fetching thread: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    return response.json().get("data", {})


def create_draft(payload: dict) -> dict:
    """Create a draft via Nylas API."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/drafts"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error creating draft: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    return response.json().get("data", {})


def verify_draft_exists(draft_id: str) -> bool:
    """Verify that a draft exists by querying for it."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/drafts/{draft_id}"
    headers = {"Authorization": f"Bearer {NYLAS_API_KEY}"}

    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        return response.ok
    except requests.RequestException:
        return False


# Gmail system folders that cannot be modified via Nylas API
# These are filtered out before updating thread labels
GMAIL_SYSTEM_FOLDERS = {
    "INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "STARRED", "IMPORTANT", "UNREAD",
    "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES", "CATEGORY_FORUMS",
}


def update_thread_labels(thread_id: str, add_labels: list, remove_labels: list) -> dict:
    """Update labels on a thread (affects all messages in thread).

    Args:
        thread_id: The thread to update
        add_labels: List of folder/label IDs to add
        remove_labels: List of folder/label IDs to remove
    """
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/threads/{thread_id}"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }

    # First get current folders
    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error fetching thread for label update: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    thread_data = response.json().get("data", {})
    current_folders = thread_data.get("folders", [])

    # Filter out Gmail system folders that can't be modified via API
    current_folders = [f for f in current_folders if f not in GMAIL_SYSTEM_FOLDERS]

    # Modify folders: remove specified labels, add new ones
    new_folders = [f for f in current_folders if f not in remove_labels]
    for label in add_labels:
        if label not in new_folders:
            new_folders.append(label)

    payload = {"folders": new_folders}

    try:
        response = requests.put(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error updating thread labels: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    return response.json().get("data", {})


def main():
    parser = argparse.ArgumentParser(description="Create Gmail draft from JSON file")
    parser.add_argument("draft_file", help="Path to draft JSON file (with to, cc, subject, body)")
    parser.add_argument("--thread-id", required=True, help="Thread ID to reply to")
    parser.add_argument("--update-labels", action="store_true",
                        help="Update labels: remove to-respond-paul, add drafted")
    parser.add_argument("--cleanup", action="store_true",
                        help="Delete draft file after successful creation")
    parser.add_argument("--verify", action="store_true",
                        help="Verify draft exists after creation (adds API call)")
    parser.add_argument("--no-reply-to", action="store_true",
                        help="Debug: create draft without reply_to_message_id")

    args = parser.parse_args()

    check_env()

    # Read draft file
    try:
        with open(args.draft_file, encoding="utf-8") as f:
            draft = json.load(f)
    except FileNotFoundError:
        print(f"Error: Draft file not found: {args.draft_file}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in draft file: {e}", file=sys.stderr)
        sys.exit(1)

    # Get thread to find latest message ID
    thread = get_thread(args.thread_id)
    message_ids = thread.get("message_ids", [])
    if not message_ids:
        print("Error: Thread has no messages", file=sys.stderr)
        sys.exit(1)

    latest_message_id = message_ids[-1]

    # Build draft payload
    payload = {
        "to": draft.get("to", []),
        "cc": draft.get("cc", []),
        "subject": draft.get("subject", ""),
        "body": draft.get("body", ""),
    }

    # Add reply_to_message_id unless --no-reply-to is set (for debugging)
    if not args.no_reply_to:
        payload["reply_to_message_id"] = latest_message_id

    # Create draft
    result = create_draft(payload)
    draft_id = result.get("id", "unknown")

    output = {
        "status": "success",
        "draft_id": draft_id,
        "subject": payload["subject"],
    }

    if not args.no_reply_to:
        output["reply_to"] = latest_message_id

    # Verify draft exists if requested
    if args.verify:
        if verify_draft_exists(draft_id):
            output["verified"] = True
        else:
            output["verified"] = False
            output["warning"] = "Draft created but verification failed - may not sync to Gmail"
            print("Warning: Draft may not appear in Gmail. Check Nylas dashboard.", file=sys.stderr)

    # Update labels if requested
    if args.update_labels:
        # Label_215 = drafted, Label_139 = to-respond-paul
        label_result = update_thread_labels(
            args.thread_id,
            add_labels=["Label_215"],
            remove_labels=["Label_139"]
        )
        # Verify labels were actually updated by checking current_folders
        updated_folders = label_result.get("folders", [])
        drafted_added = "Label_215" in updated_folders
        to_respond_removed = "Label_139" not in updated_folders

        output["labels_updated"] = drafted_added and to_respond_removed
        output["labels"] = {
            "thread_id": args.thread_id,
            "added": ["Label_215"] if drafted_added else [],
            "removed": ["Label_139"] if to_respond_removed else [],
            "current_folders": updated_folders,
        }

        if not output["labels_updated"]:
            print(f"Warning: Label update may have failed. Current folders: {updated_folders}", file=sys.stderr)

    # Single JSON output at the end (avoid duplicate outputs)
    print(json.dumps(output))

    # Cleanup if requested
    if args.cleanup:
        try:
            os.remove(args.draft_file)
        except OSError:
            pass  # Ignore cleanup errors


if __name__ == "__main__":
    main()
