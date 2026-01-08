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


def update_message_labels(message_id: str, folders: list) -> dict:
    """Update labels on a message."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/messages/{message_id}"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"folders": folders}

    try:
        response = requests.put(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Error updating labels: {e}", file=sys.stderr)
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
        "reply_to_message_id": latest_message_id,
    }

    # Create draft
    result = create_draft(payload)
    draft_id = result.get("id", "unknown")

    print(json.dumps({
        "status": "success",
        "draft_id": draft_id,
        "subject": payload["subject"],
        "reply_to": latest_message_id,
    }))

    # Update labels if requested
    if args.update_labels:
        # Label_215 = drafted, remove Label_139 = to-respond-paul
        update_message_labels(latest_message_id, ["INBOX", "Label_215"])
        print(json.dumps({
            "labels_updated": True,
            "message_id": latest_message_id,
        }))

    # Cleanup if requested
    if args.cleanup:
        try:
            os.remove(args.draft_file)
        except OSError:
            pass  # Ignore cleanup errors


if __name__ == "__main__":
    main()
