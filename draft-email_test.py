#!/usr/bin/env python3
"""Tests for draft-email.py"""

import json
import os
import tempfile
import pytest

# Import functions to test
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader

# Load module without running main
loader = SourceFileLoader("draft_email", "draft-email.py")
spec = spec_from_loader("draft_email", loader)
draft_email = module_from_spec(spec)
loader.exec_module(draft_email)


class TestParseResponse:
    """Tests for parse_draft_response()"""

    def test_valid_json(self):
        """Should parse valid JSON"""
        response = '{"to": [{"email": "test@example.com"}], "cc": [], "subject": "Re: Test", "body": "Hello"}'
        result = draft_email.parse_draft_response(response)
        assert result["to"] == [{"email": "test@example.com"}]
        assert result["cc"] == []
        assert result["subject"] == "Re: Test"
        assert result["body"] == "Hello"

    def test_json_with_whitespace(self):
        """Should handle JSON with leading/trailing whitespace"""
        response = '  \n{"to": [], "cc": [], "subject": "Test", "body": "Hi"}  \n'
        result = draft_email.parse_draft_response(response)
        assert result["body"] == "Hi"

    def test_json_with_html_body(self):
        """Should preserve HTML in body"""
        response = '{"to": [], "cc": [], "subject": "Test", "body": "<p>Hello <a href=\\"https://example.com\\">link</a></p>"}'
        result = draft_email.parse_draft_response(response)
        assert '<a href="https://example.com">link</a>' in result["body"]

    def test_invalid_json_fallback(self):
        """Should return raw text as body if JSON parsing fails"""
        response = "This is not JSON, just plain text"
        result = draft_email.parse_draft_response(response)
        assert result["body"] == response
        assert result["to"] == []
        assert result["cc"] == []
        assert result["subject"] == ""

    def test_nested_json(self):
        """Should handle nested objects in JSON"""
        response = '{"to": [{"email": "a@b.com", "name": "Test User"}], "cc": [{"email": "c@d.com"}], "subject": "Re: Nested", "body": "test"}'
        result = draft_email.parse_draft_response(response)
        assert result["to"][0]["name"] == "Test User"
        assert result["cc"][0]["email"] == "c@d.com"


class TestFormatParticipant:
    """Tests for format_participant()"""

    def test_name_and_email(self):
        """Should format as 'Name <email>'"""
        result = draft_email.format_participant({"name": "John Doe", "email": "john@example.com"})
        assert result == "John Doe <john@example.com>"

    def test_email_only(self):
        """Should return just email if no name"""
        result = draft_email.format_participant({"email": "john@example.com"})
        assert result == "john@example.com"

    def test_name_equals_email(self):
        """Should return just email if name equals email"""
        result = draft_email.format_participant({"name": "john@example.com", "email": "john@example.com"})
        assert result == "john@example.com"

    def test_empty_name(self):
        """Should return just email if name is empty string"""
        result = draft_email.format_participant({"name": "", "email": "john@example.com"})
        assert result == "john@example.com"


class TestFormatMessage:
    """Tests for format_message()"""

    def test_basic_message(self):
        """Should format a basic message"""
        msg = {
            "from": [{"name": "Sender", "email": "sender@example.com"}],
            "to": [{"email": "recipient@example.com"}],
            "date": 1704067200,  # 2024-01-01 00:00:00 UTC
            "subject": "Test Subject",
            "conversation": "Hello, this is the body.",
        }
        result = draft_email.format_message(msg)
        assert "From: Sender <sender@example.com>" in result
        assert "To: recipient@example.com" in result
        assert "Subject: Test Subject" in result
        assert "Hello, this is the body." in result

    def test_message_with_cc(self):
        """Should include CC if present"""
        msg = {
            "from": [{"email": "sender@example.com"}],
            "to": [{"email": "to@example.com"}],
            "cc": [{"email": "cc@example.com"}],
            "date": 1704067200,
            "subject": "Test",
            "conversation": "Body",
        }
        result = draft_email.format_message(msg)
        assert "Cc: cc@example.com" in result

    def test_message_without_cc(self):
        """Should not include CC line if no CC"""
        msg = {
            "from": [{"email": "sender@example.com"}],
            "to": [{"email": "to@example.com"}],
            "cc": [],
            "date": 1704067200,
            "subject": "Test",
            "conversation": "Body",
        }
        result = draft_email.format_message(msg)
        assert "Cc:" not in result

    def test_fallback_to_snippet(self):
        """Should use snippet if conversation is empty"""
        msg = {
            "from": [{"email": "sender@example.com"}],
            "to": [{"email": "to@example.com"}],
            "date": 1704067200,
            "subject": "Test",
            "conversation": "",
            "snippet": "This is the snippet",
        }
        result = draft_email.format_message(msg)
        assert "This is the snippet" in result


class TestFormatThread:
    """Tests for format_thread()"""

    def test_single_message_thread(self):
        """Should format a thread with one message"""
        thread = {"subject": "Test Thread"}
        messages = [
            {
                "from": [{"email": "sender@example.com"}],
                "to": [{"email": "to@example.com"}],
                "date": 1704067200,
                "subject": "Test Thread",
                "conversation": "Message body",
            }
        ]
        result = draft_email.format_thread(thread, messages)
        assert "=== Email Thread: Test Thread ===" in result
        assert "--- Message 1 of 1 ---" in result
        assert "Message body" in result

    def test_multi_message_thread_sorted(self):
        """Should sort messages by date (oldest first)"""
        thread = {"subject": "Multi"}
        messages = [
            {"from": [{"email": "a@b.com"}], "to": [{"email": "x@y.com"}], "date": 1704153600, "subject": "Multi", "conversation": "Second"},
            {"from": [{"email": "a@b.com"}], "to": [{"email": "x@y.com"}], "date": 1704067200, "subject": "Multi", "conversation": "First"},
        ]
        result = draft_email.format_thread(thread, messages)
        # First should appear before Second
        first_pos = result.find("First")
        second_pos = result.find("Second")
        assert first_pos < second_pos


class TestLoadFile:
    """Tests for load_file()"""

    def test_file_exists(self):
        """Should return file contents if file exists"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test content")
            f.flush()
            # Get path relative to draft-email.py location
            script_dir = os.path.dirname(os.path.abspath("draft-email.py"))
            rel_path = os.path.relpath(f.name, script_dir)
            result = draft_email.load_file(rel_path)
            assert result == "test content"
            os.unlink(f.name)

    def test_file_not_exists(self):
        """Should return None if file doesn't exist"""
        result = draft_email.load_file("nonexistent_file_12345.txt")
        assert result is None


class TestGetDraftPrompt:
    """Tests for get_draft_prompt()"""

    def test_includes_dictation(self):
        """Should include dictation in prompt"""
        thread_content = "=== Email Thread: Test ===\nSome content"
        dictation = "Tell them yes, let's meet Tuesday"
        result = draft_email.get_draft_prompt(thread_content, dictation)
        assert "User's Dictation" in result
        assert dictation in result
        assert "capture their key points" in result.lower()

    def test_includes_thread_content(self):
        """Should include the thread content"""
        thread_content = "=== Email Thread: Important Meeting ===\nMessage body here"
        dictation = "Sounds good"
        result = draft_email.get_draft_prompt(thread_content, dictation)
        assert "Email Thread to Respond To" in result
        assert thread_content in result

    def test_dictation_comes_after_thread(self):
        """Dictation section should come after thread content"""
        thread_content = "Thread content here"
        dictation = "My response dictation"
        result = draft_email.get_draft_prompt(thread_content, dictation)
        thread_pos = result.find(thread_content)
        dictation_pos = result.find(dictation)
        assert thread_pos < dictation_pos, "Dictation should appear after thread content"


class TestCLIArguments:
    """Tests for command line argument handling"""

    def test_dictation_required(self):
        """Should require --dictation argument"""
        import subprocess
        result = subprocess.run(
            ["python3", "draft-email.py", "fake_thread_id"],
            capture_output=True,
            text=True
        )
        assert result.returncode != 0
        assert "required" in result.stderr.lower() or "dictation" in result.stderr.lower()

    def test_feedback_requires_previous_draft(self):
        """Should error if --feedback without --previous-draft"""
        import subprocess
        result = subprocess.run(
            ["python3", "draft-email.py", "fake_id", "-d", "test", "--feedback", "shorter"],
            capture_output=True,
            text=True
        )
        assert result.returncode != 0
        assert "previous-draft" in result.stderr.lower()

    def test_previous_draft_requires_feedback(self):
        """Should error if --previous-draft without --feedback"""
        import subprocess
        result = subprocess.run(
            ["python3", "draft-email.py", "fake_id", "-d", "test", "--previous-draft", "/tmp/x.json"],
            capture_output=True,
            text=True
        )
        assert result.returncode != 0
        assert "feedback" in result.stderr.lower()

    def test_empty_previous_draft_file_error(self):
        """Should error if previous draft file is empty"""
        import subprocess
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("")  # Empty file
            f.flush()
            result = subprocess.run(
                ["python3", "draft-email.py", "fake_id", "-d", "test",
                 "--feedback", "shorter", "--previous-draft", f.name],
                capture_output=True,
                text=True
            )
            os.unlink(f.name)
        assert result.returncode != 0
        assert "empty" in result.stderr.lower()

    def test_whitespace_only_previous_draft_error(self):
        """Should error if previous draft file contains only whitespace"""
        import subprocess
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("   \n\n  ")  # Whitespace only
            f.flush()
            result = subprocess.run(
                ["python3", "draft-email.py", "fake_id", "-d", "test",
                 "--feedback", "shorter", "--previous-draft", f.name],
                capture_output=True,
                text=True
            )
            os.unlink(f.name)
        assert result.returncode != 0
        assert "empty" in result.stderr.lower()

    def test_missing_previous_draft_file_error(self):
        """Should error if previous draft file doesn't exist"""
        import subprocess
        result = subprocess.run(
            ["python3", "draft-email.py", "fake_id", "-d", "test",
             "--feedback", "shorter", "--previous-draft", "/nonexistent/path/draft.json"],
            capture_output=True,
            text=True
        )
        assert result.returncode != 0
        assert "not found" in result.stderr.lower()


class TestGenerateWithFeedback:
    """Tests for generate_with_feedback() message structure"""

    def test_message_structure(self, monkeypatch):
        """Should construct proper multi-turn message array"""
        captured_messages = []

        def mock_call_anthropic(messages):
            captured_messages.extend(messages)
            return '{"to": [], "cc": [], "subject": "Re: Test", "body": "Revised draft"}'

        monkeypatch.setattr(draft_email, "call_anthropic", mock_call_anthropic)
        monkeypatch.setattr(draft_email, "load_guidelines", lambda: "Guidelines here")
        monkeypatch.setattr(draft_email, "load_paul_emails", lambda: None)

        draft_email.generate_with_feedback(
            thread_content="Thread content",
            dictation="Say yes",
            previous_draft='{"body": "Original draft"}',
            feedback="Make it shorter"
        )

        assert len(captured_messages) == 3
        assert captured_messages[0]["role"] == "user"
        assert "Say yes" in captured_messages[0]["content"]
        assert captured_messages[1]["role"] == "assistant"
        assert '{"body": "Original draft"}' in captured_messages[1]["content"]
        assert captured_messages[2]["role"] == "user"
        assert "Make it shorter" in captured_messages[2]["content"]

    def test_preserves_original_dictation(self, monkeypatch):
        """Should include original dictation in first message"""
        captured_messages = []

        def mock_call_anthropic(messages):
            captured_messages.extend(messages)
            return '{"body": "test"}'

        monkeypatch.setattr(draft_email, "call_anthropic", mock_call_anthropic)
        monkeypatch.setattr(draft_email, "load_guidelines", lambda: "Guidelines")
        monkeypatch.setattr(draft_email, "load_paul_emails", lambda: None)

        draft_email.generate_with_feedback(
            thread_content="Thread",
            dictation="Original user intent here",
            previous_draft="{}",
            feedback="feedback"
        )

        # First message should contain the original dictation
        assert "Original user intent here" in captured_messages[0]["content"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
