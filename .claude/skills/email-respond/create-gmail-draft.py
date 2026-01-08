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


# System folders that cannot be set via Nylas API PUT requests
# These must be filtered out before updating message/thread labels
UNSETTABLE_FOLDERS = {"SENT", "DRAFT", "TRASH", "SPAM"}


def update_message_labels(message_id: str, add_labels: list, remove_labels: list) -> dict:
    """Update labels on a single message.

    Args:
        message_id: The message to update
        add_labels: List of folder/label IDs to add
        remove_labels: List of folder/label IDs to remove

    Returns:
        Updated message data with new folders
    """
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/messages/{message_id}"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }

    # Get current folders for this message
    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error fetching message {message_id}: {e}", file=sys.stderr)
        return {}

    if not response.ok:
        print(f"Error fetching message {message_id}: {response.status_code}", file=sys.stderr)
        return {}

    message_data = response.json().get("data", {})
    current_folders = message_data.get("folders", [])

    # Filter out system folders that can't be set via API
    safe_folders = [f for f in current_folders if f not in UNSETTABLE_FOLDERS]

    # Modify folders: remove specified labels, add new ones
    new_folders = [f for f in safe_folders if f not in remove_labels]
    for label in add_labels:
        if label not in new_folders:
            new_folders.append(label)

    # Update message
    try:
        response = requests.put(url, headers=headers, json={"folders": new_folders}, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error updating message {message_id}: {e}", file=sys.stderr)
        return {}

    if not response.ok:
        print(f"Error updating message {message_id}: {response.status_code}", file=sys.stderr)
        return {}

    return response.json().get("data", {})


def update_thread_labels(thread_id: str, add_labels: list, remove_labels: list) -> dict:
    """Update labels on all messages in a thread.

    Updates each message individually to avoid issues with DRAFT system folder
    blocking thread-level updates.

    Args:
        thread_id: The thread to update
        add_labels: List of folder/label IDs to add
        remove_labels: List of folder/label IDs to remove

    Returns:
        Dict with thread_id, message_count, and folders from last updated message
    """
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/threads/{thread_id}"
    headers = {"Authorization": f"Bearer {NYLAS_API_KEY}"}

    # Get thread to find all message IDs
    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error fetching thread for label update: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    thread_data = response.json().get("data", {})
    message_ids = thread_data.get("message_ids", [])

    if not message_ids:
        print("Error: Thread has no messages", file=sys.stderr)
        sys.exit(1)

    # Update each message in the thread
    updated_count = 0
    last_result = {}
    for msg_id in message_ids:
        result = update_message_labels(msg_id, add_labels, remove_labels)
        if result:
            updated_count += 1
            last_result = result

    return {
        "thread_id": thread_id,
        "messages_total": len(message_ids),
        "messages_updated": updated_count,
        "folders": last_result.get("folders", []),
    }


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

        messages_total = label_result.get("messages_total", 0)
        messages_updated = label_result.get("messages_updated", 0)
        all_updated = messages_updated == messages_total and messages_total > 0

        output["labels_updated"] = drafted_added and to_respond_removed and all_updated
        output["labels"] = {
            "thread_id": args.thread_id,
            "messages_total": messages_total,
            "messages_updated": messages_updated,
            "added": ["Label_215"] if drafted_added else [],
            "removed": ["Label_139"] if to_respond_removed else [],
            "current_folders": updated_folders,
        }

        if not all_updated:
            print(f"Warning: Only {messages_updated}/{messages_total} messages updated", file=sys.stderr)
        elif not output["labels_updated"]:
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
