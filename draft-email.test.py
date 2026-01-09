"""Tests for draft-email.py normalization and utility functions."""

import unittest
import sys
import os
import tempfile

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from importlib import import_module

# Import the module (handles hyphen in filename)
draft_email = import_module("draft-email")


class TestNormalizeRecipient(unittest.TestCase):
    """Tests for normalize_recipient function."""

    def test_string_email(self):
        """String email should become {email, name: ''}."""
        result = draft_email.normalize_recipient("test@example.com")
        self.assertEqual(result, {"email": "test@example.com", "name": ""})

    def test_dict_with_email_and_name(self):
        """Dict with email and name should be unchanged."""
        result = draft_email.normalize_recipient(
            {"email": "test@example.com", "name": "Test User"}
        )
        self.assertEqual(result, {"email": "test@example.com", "name": "Test User"})

    def test_dict_with_email_only(self):
        """Dict with only email should get empty name."""
        result = draft_email.normalize_recipient({"email": "test@example.com"})
        self.assertEqual(result, {"email": "test@example.com", "name": ""})

    def test_dict_with_name_only(self):
        """Dict with only name should get empty email."""
        result = draft_email.normalize_recipient({"name": "Test User"})
        self.assertEqual(result, {"email": "", "name": "Test User"})

    def test_empty_dict(self):
        """Empty dict should return empty email and name."""
        result = draft_email.normalize_recipient({})
        self.assertEqual(result, {"email": "", "name": ""})

    def test_invalid_type(self):
        """Invalid type should return empty email and name."""
        result = draft_email.normalize_recipient(123)
        self.assertEqual(result, {"email": "", "name": ""})
        result = draft_email.normalize_recipient(None)
        self.assertEqual(result, {"email": "", "name": ""})


class TestNormalizeDraft(unittest.TestCase):
    """Tests for normalize_draft function."""

    def test_normalizes_cc_strings(self):
        """CC list of strings should be normalized to objects."""
        draft = {
            "to": [{"email": "to@example.com", "name": "To User"}],
            "cc": ["cc1@example.com", "cc2@example.com"],
            "subject": "Test",
            "body": "Hello"
        }
        result = draft_email.normalize_draft(draft)
        self.assertEqual(result["cc"], [
            {"email": "cc1@example.com", "name": ""},
            {"email": "cc2@example.com", "name": ""}
        ])

    def test_normalizes_mixed_cc(self):
        """Mixed CC (strings and objects) should all become objects."""
        draft = {
            "to": [{"email": "to@example.com", "name": "To User"}],
            "cc": [
                "string@example.com",
                {"email": "object@example.com", "name": "Object User"}
            ],
            "subject": "Test",
            "body": "Hello"
        }
        result = draft_email.normalize_draft(draft)
        self.assertEqual(result["cc"], [
            {"email": "string@example.com", "name": ""},
            {"email": "object@example.com", "name": "Object User"}
        ])

    def test_normalizes_to_field(self):
        """To field should also be normalized."""
        draft = {
            "to": ["to@example.com"],
            "cc": [],
            "subject": "Test",
            "body": "Hello"
        }
        result = draft_email.normalize_draft(draft)
        self.assertEqual(result["to"], [{"email": "to@example.com", "name": ""}])

    def test_handles_missing_fields(self):
        """Missing to/cc/bcc fields should not cause errors."""
        draft = {"subject": "Test", "body": "Hello"}
        result = draft_email.normalize_draft(draft)
        self.assertEqual(result, {"subject": "Test", "body": "Hello"})

    def test_preserves_other_fields(self):
        """Other fields should be preserved."""
        draft = {
            "to": [{"email": "to@example.com", "name": "To"}],
            "cc": [],
            "subject": "Test Subject",
            "body": "<p>Hello</p>",
            "extra_field": "preserved"
        }
        result = draft_email.normalize_draft(draft)
        self.assertEqual(result["subject"], "Test Subject")
        self.assertEqual(result["body"], "<p>Hello</p>")
        self.assertEqual(result["extra_field"], "preserved")

    def test_normalizes_bcc_field(self):
        """BCC field should also be normalized."""
        draft = {
            "to": [{"email": "to@example.com", "name": "To"}],
            "cc": [],
            "bcc": ["hidden@example.com"],
            "subject": "Test",
            "body": "Hello"
        }
        result = draft_email.normalize_draft(draft)
        self.assertEqual(result["bcc"], [{"email": "hidden@example.com", "name": ""}])

    def test_does_not_mutate_input(self):
        """normalize_draft should not mutate the input dict."""
        original_cc = ["cc@example.com"]
        draft = {
            "to": [{"email": "to@example.com", "name": "To"}],
            "cc": original_cc,
            "subject": "Test",
            "body": "Hello"
        }
        result = draft_email.normalize_draft(draft)
        # Original should be unchanged
        self.assertEqual(draft["cc"], ["cc@example.com"])
        # Result should be normalized
        self.assertEqual(result["cc"], [{"email": "cc@example.com", "name": ""}])
        # Should be different objects
        self.assertIsNot(result, draft)


class TestAtomicWrite(unittest.TestCase):
    """Tests for atomic_write function."""

    def test_writes_new_file(self):
        """Should create a new file with content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.json")
            draft_email.atomic_write(filepath, '{"test": true}')

            with open(filepath, encoding="utf-8") as f:
                content = f.read()
            self.assertEqual(content, '{"test": true}')

    def test_overwrites_existing_file(self):
        """Should overwrite existing file content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.json")

            # Write initial content
            with open(filepath, "w", encoding="utf-8") as f:
                f.write("old content")

            # Overwrite with atomic_write
            draft_email.atomic_write(filepath, "new content")

            with open(filepath, encoding="utf-8") as f:
                content = f.read()
            self.assertEqual(content, "new content")

    def test_same_input_output_file_simulation(self):
        """Simulate using same file for input and output (the --previous-draft use case)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "draft.json")

            # Write initial draft
            initial_content = '{"body": "Hello", "to": []}'
            draft_email.atomic_write(filepath, initial_content)

            # Read the file (simulating --previous-draft)
            with open(filepath, encoding="utf-8") as f:
                read_content = f.read()

            # Modify and write back to same file (simulating --output)
            new_content = '{"body": "Hello revised", "to": []}'
            draft_email.atomic_write(filepath, new_content)

            # Verify we read the original content AND wrote new content
            self.assertEqual(read_content, initial_content)
            with open(filepath, encoding="utf-8") as f:
                final_content = f.read()
            self.assertEqual(final_content, new_content)

    def test_no_temp_file_left_on_success(self):
        """Should not leave temp files after successful write."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.json")
            draft_email.atomic_write(filepath, "content")

            # Only the target file should exist
            files = os.listdir(tmpdir)
            self.assertEqual(files, ["test.json"])


if __name__ == "__main__":
    unittest.main()
