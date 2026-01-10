#!/usr/bin/env python3
"""Tests for email_utils shared library."""

import os
import tempfile

import pytest

import email_utils


class TestFormatParticipant:
    """Tests for format_participant()"""

    def test_with_name_and_email(self):
        """Should format as 'Name <email>'"""
        result = email_utils.format_participant({"name": "John Doe", "email": "john@example.com"})
        assert result == "John Doe <john@example.com>"

    def test_with_email_only(self):
        """Should return just email if no name"""
        result = email_utils.format_participant({"email": "john@example.com"})
        assert result == "john@example.com"

    def test_name_same_as_email(self):
        """Should return just email if name equals email"""
        result = email_utils.format_participant({"name": "john@example.com", "email": "john@example.com"})
        assert result == "john@example.com"

    def test_empty_name(self):
        """Should return just email if name is empty string"""
        result = email_utils.format_participant({"name": "", "email": "john@example.com"})
        assert result == "john@example.com"

    def test_missing_email(self):
        """Should handle missing email gracefully"""
        result = email_utils.format_participant({"name": "John Doe"})
        assert result == "John Doe <>"


class TestFormatDate:
    """Tests for format_date()"""

    def test_valid_timestamp(self):
        """Should format timestamp to readable date"""
        # 1704067200 = 2024-01-01 00:00:00 UTC (may show as Dec 31 in some timezones)
        result = email_utils.format_date(1704067200)
        # Just verify it returns a formatted string with expected parts
        assert ":" in result  # Time component
        assert ("AM" in result or "PM" in result)  # 12-hour format
        assert len(result) > 10  # Has reasonable length

    def test_zero_timestamp(self):
        """Should return Unknown for zero timestamp"""
        result = email_utils.format_date(0)
        assert result == "Unknown"

    def test_none_timestamp(self):
        """Should return Unknown for None"""
        result = email_utils.format_date(None)
        assert result == "Unknown"


class TestNormalizeRecipient:
    """Tests for normalize_recipient()"""

    def test_string_input(self):
        """Should convert string email to dict format"""
        result = email_utils.normalize_recipient("john@example.com")
        assert result == {"email": "john@example.com", "name": ""}

    def test_dict_input_with_both(self):
        """Should preserve dict with email and name"""
        result = email_utils.normalize_recipient({"email": "john@example.com", "name": "John Doe"})
        assert result == {"email": "john@example.com", "name": "John Doe"}

    def test_dict_input_email_only(self):
        """Should handle dict with email only"""
        result = email_utils.normalize_recipient({"email": "john@example.com"})
        assert result == {"email": "john@example.com", "name": ""}

    def test_empty_dict(self):
        """Should handle empty dict"""
        result = email_utils.normalize_recipient({})
        assert result == {"email": "", "name": ""}


class TestNormalizeDraft:
    """Tests for normalize_draft()"""

    def test_normalizes_to_list(self):
        """Should normalize string recipients to list of dicts"""
        draft = {
            "to": ["john@example.com", "jane@example.com"],
            "cc": [],
            "subject": "Hello",
            "body": "World",
        }
        result = email_utils.normalize_draft(draft)

        assert result["to"] == [
            {"email": "john@example.com", "name": ""},
            {"email": "jane@example.com", "name": ""},
        ]
        assert result["cc"] == []
        assert result["subject"] == "Hello"

    def test_preserves_dicts(self):
        """Should preserve recipients already in dict format"""
        draft = {
            "to": [{"email": "john@example.com", "name": "John Doe"}],
            "cc": [{"email": "jane@example.com", "name": "Jane Smith"}],
        }
        result = email_utils.normalize_draft(draft)

        assert result["to"] == [{"email": "john@example.com", "name": "John Doe"}]
        assert result["cc"] == [{"email": "jane@example.com", "name": "Jane Smith"}]

    def test_mixed_format(self):
        """Should handle mix of strings and dicts"""
        draft = {
            "to": ["john@example.com", {"email": "jane@example.com", "name": "Jane"}],
            "cc": [],
        }
        result = email_utils.normalize_draft(draft)

        assert result["to"] == [
            {"email": "john@example.com", "name": ""},
            {"email": "jane@example.com", "name": "Jane"},
        ]

    def test_single_recipient_to_list(self):
        """Should convert single recipient to list"""
        draft = {
            "to": "john@example.com",
        }
        result = email_utils.normalize_draft(draft)

        assert result["to"] == [{"email": "john@example.com", "name": ""}]

    def test_normalizes_from_field(self):
        """Should normalize 'from' field (single recipient, not list)"""
        draft = {
            "from": "paul@example.com",
            "to": ["john@example.com"],
        }
        result = email_utils.normalize_draft(draft)

        assert result["from"] == [{"email": "paul@example.com", "name": ""}]

    def test_from_field_list_input(self):
        """Should handle 'from' as list and take first element"""
        draft = {
            "from": [{"email": "paul@example.com", "name": "Paul"}],
            "to": ["john@example.com"],
        }
        result = email_utils.normalize_draft(draft)

        assert result["from"] == [{"email": "paul@example.com", "name": "Paul"}]

    def test_missing_fields(self):
        """Should handle missing to/cc/bcc fields"""
        draft = {"subject": "Hello"}
        result = email_utils.normalize_draft(draft)

        assert result["to"] == []
        assert result["cc"] == []
        assert result["bcc"] == []

    def test_preserves_other_fields(self):
        """Should preserve non-recipient fields"""
        draft = {
            "to": ["john@example.com"],
            "subject": "Test Subject",
            "body": "Test Body",
            "reply_to_message_id": "msg_123",
        }
        result = email_utils.normalize_draft(draft)

        assert result["subject"] == "Test Subject"
        assert result["body"] == "Test Body"
        assert result["reply_to_message_id"] == "msg_123"


class TestAtomicWrite:
    """Tests for atomic_write()"""

    def test_writes_file(self):
        """Should write content to file"""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.txt")
            content = "Hello, World!"

            email_utils.atomic_write(path, content)

            with open(path, encoding="utf-8") as f:
                result = f.read()

            assert result == content

    def test_overwrites_existing(self):
        """Should overwrite existing file"""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.txt")

            # Write first content
            with open(path, "w", encoding="utf-8") as f:
                f.write("Old content")

            # Overwrite with atomic_write
            email_utils.atomic_write(path, "New content")

            with open(path, encoding="utf-8") as f:
                result = f.read()

            assert result == "New content"

    def test_handles_unicode(self):
        """Should handle Unicode content"""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.txt")
            content = "Hello 世界 🌍"

            email_utils.atomic_write(path, content)

            with open(path, encoding="utf-8") as f:
                result = f.read()

            assert result == content

    def test_creates_in_current_dir_if_no_path(self):
        """Should create in current directory if path has no directory component"""
        # Use a temp file name in current directory
        path = tempfile.mktemp(suffix=".txt")
        try:
            content = "Test content"
            email_utils.atomic_write(path, content)

            with open(path, encoding="utf-8") as f:
                result = f.read()

            assert result == content
        finally:
            # Clean up
            if os.path.exists(path):
                os.unlink(path)


class TestConstants:
    """Tests for module constants"""

    def test_label_constants_exist(self):
        """Should have label constants defined"""
        assert hasattr(email_utils, "LABEL_TO_RESPOND")
        assert hasattr(email_utils, "LABEL_TO_READ")
        assert hasattr(email_utils, "LABEL_DRAFTED")

    def test_unsettable_folders(self):
        """Should have UNSETTABLE_FOLDERS set defined"""
        assert hasattr(email_utils, "UNSETTABLE_FOLDERS")
        assert "INBOX" in email_utils.UNSETTABLE_FOLDERS
        assert "SENT" in email_utils.UNSETTABLE_FOLDERS
        assert "DRAFTS" in email_utils.UNSETTABLE_FOLDERS

    def test_nylas_config_exists(self):
        """Should have Nylas configuration constants"""
        assert hasattr(email_utils, "NYLAS_BASE_URL")
        assert hasattr(email_utils, "REQUEST_TIMEOUT")
        assert email_utils.NYLAS_BASE_URL == "https://api.us.nylas.com/v3"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
