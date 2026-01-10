#!/usr/bin/env python3
"""
Shared utilities for email workflow.

This module provides common functions for Nylas API interactions, formatting,
and draft management used across email-related scripts.

Design: Located at project root so scripts can import without sys.path hacking.
All scripts run from project root: `python3 .claude/skills/email-respond/script.py`
"""

import os
import sys
import tempfile
from datetime import datetime
from typing import Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

# === Configuration ===
NYLAS_API_KEY = os.getenv("NYLAS_API_KEY")
NYLAS_GRANT_ID = os.getenv("NYLAS_GRANT_ID")
NYLAS_BASE_URL = "https://api.us.nylas.com/v3"
REQUEST_TIMEOUT = 30

# Label IDs (Gmail labels mapped by Nylas)
LABEL_TO_RESPOND = "Label_139"  # to-respond-paul
LABEL_TO_READ = "Label_138"  # to-read
LABEL_DRAFTED = "Label_215"  # drafted

# Folders that can't be modified via API
UNSETTABLE_FOLDERS = {"INBOX", "SENT", "DRAFTS", "TRASH", "SPAM", "STARRED", "IMPORTANT"}


def check_env(*required: str) -> None:
    """Check required environment variables exist.

    Args:
        *required: Environment variable names to check (e.g., "NYLAS_API_KEY")

    Exits:
        Exits with code 1 if any required variables are missing.

    Example:
        check_env("NYLAS_API_KEY", "NYLAS_GRANT_ID", "ANTHROPIC_API_KEY")
    """
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        print("Add them to your .env file", file=sys.stderr)
        sys.exit(1)


def nylas_get(endpoint: str) -> dict:
    """Make a GET request to the Nylas API.

    Args:
        endpoint: API endpoint (e.g., "/threads/abc123")

    Returns:
        Response data dict (contents of "data" field)

    Exits:
        Exits with code 1 on request failure or non-2xx response

    Example:
        thread = nylas_get(f"/threads/{thread_id}")
    """
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


def nylas_put(endpoint: str, payload: dict) -> dict:
    """Make a PUT request to the Nylas API.

    Args:
        endpoint: API endpoint (e.g., "/messages/abc123")
        payload: JSON payload dict

    Returns:
        Response data dict (contents of "data" field)

    Exits:
        Exits with code 1 on request failure or non-2xx response

    Example:
        nylas_put(f"/messages/{msg_id}", {"unread": False})
    """
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}{endpoint}"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.put(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Nylas request failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    return response.json().get("data", {})


def nylas_post(endpoint: str, payload: dict) -> dict:
    """Make a POST request to the Nylas API.

    Args:
        endpoint: API endpoint (e.g., "/drafts")
        payload: JSON payload dict

    Returns:
        Response data dict (contents of "data" field)

    Exits:
        Exits with code 1 on request failure or non-2xx response

    Example:
        draft = nylas_post("/drafts", {"subject": "Hello", "body": "World"})
    """
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}{endpoint}"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"Nylas request failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not response.ok:
        print(f"Nylas API error: {response.status_code} {response.text}", file=sys.stderr)
        sys.exit(1)

    return response.json().get("data", {})


def get_thread(thread_id: str) -> dict:
    """Fetch a thread by ID.

    Args:
        thread_id: Thread ID from Nylas

    Returns:
        Thread dict with subject, message_ids, etc.

    Example:
        thread = get_thread("thread_abc123")
        print(thread["subject"])
    """
    return nylas_get(f"/threads/{thread_id}")


def clean_messages(message_ids: List[str]) -> List[Dict]:
    """Fetch and clean multiple messages via Nylas Clean Messages API.

    Nylas limits batch requests to 20 message IDs, so this automatically batches.
    The Clean Messages API strips quoted content and extracts plain text.

    Args:
        message_ids: List of Nylas message IDs

    Returns:
        List of cleaned message dicts with "conversation" field (plain text)

    Example:
        messages = clean_messages(["msg1", "msg2", "msg3"])
        for msg in messages:
            print(msg["conversation"])
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
        batch = message_ids[i : i + BATCH_SIZE]
        payload = {
            "message_id": batch,
            "ignore_images": True,
            "ignore_links": False,
            "html_as_markdown": True,
            "images_as_markdown": True,
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


def update_thread_labels(thread_id: str, add: List[str] = None, remove: List[str] = None) -> None:
    """Update labels on all messages in a thread.

    Args:
        thread_id: Thread ID from Nylas
        add: List of label IDs to add (e.g., [LABEL_DRAFTED])
        remove: List of label IDs to remove (e.g., [LABEL_TO_RESPOND])

    Note:
        Only modifies "labels", not "folders" (INBOX, SENT, etc can't be modified)

    Example:
        update_thread_labels(
            "thread_123",
            add=[LABEL_DRAFTED],
            remove=[LABEL_TO_RESPOND]
        )
    """
    if add is None:
        add = []
    if remove is None:
        remove = []

    # Get all messages in thread
    thread = get_thread(thread_id)
    message_ids = thread.get("message_ids", [])

    if not message_ids:
        return

    # Update each message's labels
    for msg_id in message_ids:
        # Fetch current labels
        msg = nylas_get(f"/messages/{msg_id}?select=folders,labels")
        current_labels = [label["id"] for label in msg.get("labels", [])]
        current_folders = [folder["id"] for folder in msg.get("folders", [])]

        # Compute new labels (add/remove)
        new_labels = list(set(current_labels) - set(remove))
        new_labels.extend([label for label in add if label not in new_labels])

        # Filter out unsettable folders (API requirement)
        settable_folders = [f for f in current_folders if f.upper() not in UNSETTABLE_FOLDERS]

        # Update message
        payload = {
            "labels": new_labels,
            "folders": settable_folders,
        }
        nylas_put(f"/messages/{msg_id}", payload)


def format_participant(p: dict) -> str:
    """Format email participant as 'Name <email>' or just 'email'.

    Args:
        p: Participant dict with "name" and "email" keys

    Returns:
        Formatted string

    Example:
        format_participant({"name": "John Doe", "email": "john@example.com"})
        # Returns: "John Doe <john@example.com>"

        format_participant({"email": "john@example.com"})
        # Returns: "john@example.com"
    """
    name = p.get("name", "")
    email = p.get("email", "")

    if name and name != email:
        return f"{name} <{email}>"
    return email


def format_date(timestamp: int) -> str:
    """Format Unix timestamp to readable date.

    Args:
        timestamp: Unix timestamp (seconds since epoch)

    Returns:
        Formatted date string like "Jan 08, 10:30 AM"

    Example:
        format_date(1704729600)  # 2024-01-08 10:00:00
        # Returns: "Jan 08, 10:00 AM"
    """
    if not timestamp:
        return "Unknown"
    return datetime.fromtimestamp(timestamp).strftime("%b %d, %I:%M %p")


def normalize_recipient(recipient) -> dict:
    """Normalize recipient to {email, name} format.

    Args:
        recipient: Either a string (email address) or dict with email/name

    Returns:
        Dict with "email" and "name" keys

    Example:
        normalize_recipient("john@example.com")
        # Returns: {"email": "john@example.com", "name": ""}

        normalize_recipient({"email": "john@example.com", "name": "John"})
        # Returns: {"email": "john@example.com", "name": "John"}
    """
    if isinstance(recipient, str):
        return {"email": recipient, "name": ""}
    return {"email": recipient.get("email", ""), "name": recipient.get("name", "")}


def normalize_draft(draft: dict) -> dict:
    """Normalize all recipients in draft to {email, name} format.

    Args:
        draft: Draft dict with "to", "cc", "bcc", "from" keys

    Returns:
        New draft dict with all recipients normalized

    Example:
        draft = {"to": ["john@example.com"], "cc": [], "subject": "Hello"}
        normalized = normalize_draft(draft)
        # normalized["to"] = [{"email": "john@example.com", "name": ""}]
    """
    normalized = draft.copy()

    # Normalize recipient lists
    for field in ["to", "cc", "bcc"]:
        if field in draft and draft[field]:
            if isinstance(draft[field], list):
                normalized[field] = [normalize_recipient(r) for r in draft[field]]
            else:
                # Single recipient, convert to list
                normalized[field] = [normalize_recipient(draft[field])]
        else:
            normalized[field] = []

    # Normalize "from" (single recipient, not a list)
    if "from" in draft and draft["from"]:
        if isinstance(draft["from"], list):
            normalized["from"] = [normalize_recipient(draft["from"][0])]
        else:
            normalized["from"] = [normalize_recipient(draft["from"])]

    return normalized


def atomic_write(path: str, content: str) -> None:
    """Write file atomically via temp file + rename.

    Ensures file is fully written before being visible. Prevents partial reads.

    Args:
        path: Destination file path
        content: Content to write

    Example:
        atomic_write("/tmp/draft.json", json.dumps(draft))
    """
    directory = os.path.dirname(path) or "."
    with tempfile.NamedTemporaryFile(mode="w", dir=directory, delete=False, encoding="utf-8") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    # Atomic rename (on same filesystem)
    os.replace(tmp_path, path)
