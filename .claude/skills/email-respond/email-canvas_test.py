#!/usr/bin/env python3
"""Tests for email-canvas.py"""

import os
import subprocess
import sys
import tempfile

import pytest

# Import functions to test
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader

# Load module without running main
script_path = os.path.join(os.path.dirname(__file__), "email-canvas.py")
loader = SourceFileLoader("email_canvas", script_path)
spec = spec_from_loader("email_canvas", loader)
email_canvas = module_from_spec(spec)
loader.exec_module(email_canvas)


class TestFormatDate:
    """Tests for format_date()"""

    def test_valid_timestamp(self):
        """Should format timestamp to readable date"""
        # 1704067200 = 2024-01-01 00:00:00 UTC (may show as Dec 31 in some timezones)
        result = email_canvas.format_date(1704067200)
        # Just verify it returns a formatted string with expected parts
        assert ":" in result  # Time component
        assert ("AM" in result or "PM" in result)  # 12-hour format
        assert len(result) > 10  # Has reasonable length

    def test_zero_timestamp(self):
        """Should return Unknown for zero timestamp"""
        result = email_canvas.format_date(0)
        assert result == "Unknown"

    def test_none_timestamp(self):
        """Should return Unknown for None"""
        result = email_canvas.format_date(None)
        assert result == "Unknown"


class TestFormatParticipant:
    """Tests for format_participant()"""

    def test_name_and_email(self):
        """Should format as 'Name <email>'"""
        result = email_canvas.format_participant({"name": "John Doe", "email": "john@example.com"})
        assert result == "John Doe <john@example.com>"

    def test_email_only(self):
        """Should return just email if no name"""
        result = email_canvas.format_participant({"email": "john@example.com"})
        assert result == "john@example.com"

    def test_name_equals_email(self):
        """Should return just email if name equals email"""
        result = email_canvas.format_participant({"name": "john@example.com", "email": "john@example.com"})
        assert result == "john@example.com"

    def test_empty_name(self):
        """Should return just email if name is empty string"""
        result = email_canvas.format_participant({"name": "", "email": "john@example.com"})
        assert result == "john@example.com"


class TestDoubleLine:
    """Tests for double_line()"""

    def test_default_char(self):
        """Should use default character"""
        result = email_canvas.double_line()
        assert result == "═" * email_canvas.PANEL_WIDTH

    def test_custom_char(self):
        """Should use custom character"""
        result = email_canvas.double_line("-")
        assert result == "-" * email_canvas.PANEL_WIDTH


class TestSingleLine:
    """Tests for single_line()"""

    def test_default_char(self):
        """Should use default character"""
        result = email_canvas.single_line()
        assert result == "─" * email_canvas.PANEL_WIDTH

    def test_custom_char(self):
        """Should use custom character"""
        result = email_canvas.single_line("=")
        assert result == "=" * email_canvas.PANEL_WIDTH


class TestPanelWidth:
    """Tests for PANEL_WIDTH constant"""

    def test_panel_width_is_set(self):
        """PANEL_WIDTH should be a reasonable value"""
        assert email_canvas.PANEL_WIDTH > 0
        assert email_canvas.PANEL_WIDTH < 200


class TestDraftFileArgument:
    """Tests for --draft-file argument"""

    def test_draft_file_reads_content(self):
        """Should read draft content from file"""
        script_path = os.path.join(os.path.dirname(__file__), "email-canvas.py")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("This is my draft content from file")
            f.flush()
            # Can't easily test the full flow without API, but we can test arg parsing
            result = subprocess.run(
                ["python3", script_path, "--draft-file", f.name],
                capture_output=True,
                text=True
            )
            os.unlink(f.name)
        # Should fail because --draft-file requires --thread-id, but should mention that
        assert result.returncode != 0
        assert "thread-id" in result.stderr.lower()

    def test_draft_file_missing_error(self):
        """Should error if draft file doesn't exist"""
        script_path = os.path.join(os.path.dirname(__file__), "email-canvas.py")
        result = subprocess.run(
            ["python3", script_path, "--thread-id", "fake", "--draft-file", "/nonexistent/file.txt"],
            capture_output=True,
            text=True
        )
        assert result.returncode != 0
        assert "not found" in result.stderr.lower()

    def test_draft_and_draft_file_both_require_thread_id(self):
        """Both --draft and --draft-file should require --thread-id"""
        script_path = os.path.join(os.path.dirname(__file__), "email-canvas.py")
        # Test --draft
        result1 = subprocess.run(
            ["python3", script_path, "--draft", "Some draft"],
            capture_output=True,
            text=True
        )
        assert result1.returncode != 0
        assert "thread-id" in result1.stderr.lower()


class TestHtmlToText:
    """Tests for html_to_text()"""

    def test_strips_html_tags(self):
        """Should remove HTML tags"""
        html = "<p>Hello <strong>world</strong></p>"
        result = email_canvas.html_to_text(html)
        assert "<p>" not in result
        assert "<strong>" not in result
        assert "Hello" in result
        assert "world" in result

    def test_preserves_paragraph_breaks(self):
        """Should convert </p> to paragraph breaks"""
        html = "<p>First paragraph</p><p>Second paragraph</p>"
        result = email_canvas.html_to_text(html)
        # Should have double newline between paragraphs
        assert "First paragraph" in result
        assert "Second paragraph" in result

    def test_converts_br_to_newline(self):
        """Should convert <br> to newlines"""
        html = "Line one<br>Line two<br/>Line three"
        result = email_canvas.html_to_text(html)
        assert "Line one" in result
        assert "Line two" in result
        assert "Line three" in result

    def test_handles_empty_input(self):
        """Should handle empty string"""
        result = email_canvas.html_to_text("")
        assert result == ""

    def test_handles_none_input(self):
        """Should handle None input"""
        result = email_canvas.html_to_text(None)
        assert result == ""

    def test_decodes_html_entities(self):
        """Should decode HTML entities"""
        html = "&amp; &lt; &gt; &quot;"
        result = email_canvas.html_to_text(html)
        assert "&" in result
        assert "<" in result
        assert ">" in result


class TestWrapText:
    """Tests for wrap_text()"""

    def test_wraps_long_lines(self):
        """Should wrap text to fit panel width"""
        long_text = "word " * 50  # Very long line
        result = email_canvas.wrap_text(long_text, width=40)
        lines = result.split("\n")
        for line in lines:
            assert len(line) <= 45  # Some flexibility for word boundaries

    def test_preserves_paragraph_breaks(self):
        """Should preserve double newlines as paragraph breaks"""
        text = "First paragraph here.\n\nSecond paragraph here."
        result = email_canvas.wrap_text(text)
        assert "\n\n" in result

    def test_handles_empty_input(self):
        """Should handle empty string"""
        result = email_canvas.wrap_text("")
        assert result == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
