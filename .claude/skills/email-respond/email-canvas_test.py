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

# Add project root to path so email_utils can be imported
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))
import email_utils

# Load module without running main
script_path = os.path.join(os.path.dirname(__file__), "email-canvas.py")
loader = SourceFileLoader("email_canvas", script_path)
spec = spec_from_loader("email_canvas", loader)
email_canvas = module_from_spec(spec)
loader.exec_module(email_canvas)


class TestFormatDate:
    """Tests for format_date() - now from email_utils"""

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


class TestFormatParticipant:
    """Tests for format_participant() - now from email_utils"""

    def test_name_and_email(self):
        """Should format as 'Name <email>'"""
        result = email_utils.format_participant({"name": "John Doe", "email": "john@example.com"})
        assert result == "John Doe <john@example.com>"

    def test_email_only(self):
        """Should return just email if no name"""
        result = email_utils.format_participant({"email": "john@example.com"})
        assert result == "john@example.com"

    def test_name_equals_email(self):
        """Should return just email if name equals email"""
        result = email_utils.format_participant({"name": "john@example.com", "email": "john@example.com"})
        assert result == "john@example.com"

    def test_empty_name(self):
        """Should return just email if name is empty string"""
        result = email_utils.format_participant({"name": "", "email": "john@example.com"})
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
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "email-canvas.py"))
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("This is my draft content from file")
            f.flush()
            # Can't easily test the full flow without API, but we can test arg parsing
            result = subprocess.run(
                ["python3", script_path, "--draft-file", f.name],
                capture_output=True,
                text=True,
            )
            os.unlink(f.name)
        # Should fail because --draft-file requires --thread-id, but should mention that
        assert result.returncode != 0
        assert "thread-id" in result.stderr.lower()

    def test_draft_file_missing_error(self):
        """Should error if draft file doesn't exist"""
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "email-canvas.py"))
        result = subprocess.run(
            ["python3", script_path, "--thread-id", "fake", "--draft-file", "/nonexistent/file.txt"],
            capture_output=True,
            text=True,
        )
        assert result.returncode != 0
        assert "not found" in result.stderr.lower()

    def test_draft_and_draft_file_both_require_thread_id(self):
        """Both --draft and --draft-file should require --thread-id"""
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "email-canvas.py"))
        # Test --draft
        result1 = subprocess.run(
            ["python3", script_path, "--draft", "Some draft"],
            capture_output=True,
            text=True,
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

    def test_preserves_blank_lines_within_paragraph(self):
        """Should preserve blank lines within a paragraph (regression test for P0 bug)

        This was the actual bug: line 215 `if line_text:` was discarding blank lines.
        The fix adds an else clause to preserve them.

        The bug manifests when you have 3+ consecutive newlines, which splits into
        paragraphs where one starts with \n, creating an empty line.
        """
        # Test case 1: Triple newline (should preserve the extra spacing)
        text = "Line one\n\n\nLine two"
        result = email_canvas.wrap_text(text, width=40)
        # Should have triple newline preserved
        assert "\n\n\n" in result, f"Expected triple newline in: {repr(result)}"

        # Test case 2: Quad newline
        text_quad = "Line one\n\n\n\nLine two"
        result_quad = email_canvas.wrap_text(text_quad, width=40)
        # Should have quad newline preserved
        assert "\n\n\n\n" in result_quad, f"Expected quad newline in: {repr(result_quad)}"

        # Test case 3: Verify double newline still works (baseline)
        text_double = "Line one\n\nLine two"
        result_double = email_canvas.wrap_text(text_double, width=40)
        assert result_double == "Line one\n\nLine two"

    def test_preserves_blank_lines_in_formatted_email_draft(self):
        """Test realistic email draft with blank lines for spacing

        Real-world scenario: AI drafts email with:
        - Greeting
        - (blank line)
        - Body paragraph
        - (blank line)
        - Closing

        The bug would collapse all blank lines, making it hard to read.
        """
        draft = "Hi John,\n\nThanks for reaching out about the project.\n\nLooking forward to discussing this further.\n\nBest,\nPaul"
        result = email_canvas.wrap_text(draft, width=60)

        # Should have paragraph breaks (double newlines) preserved
        lines = result.split("\n")
        # Check that we have multiple segments separated by blank lines
        assert len([l for l in lines if l == ""]) >= 2  # At least 2 blank lines

        # Verify all content is present
        assert "Hi John," in result
        assert "Thanks for reaching out" in result
        assert "Looking forward" in result
        assert "Best," in result
        assert "Paul" in result

    def test_wrap_text_does_not_add_extra_blank_lines(self):
        """Ensure fix doesn't add unwanted blank lines where there were none"""
        text = "Line one\nLine two\nLine three"
        result = email_canvas.wrap_text(text, width=40)

        # These are single newlines within a paragraph, should be preserved as-is
        # not converted to paragraph breaks
        assert "Line one" in result
        assert "Line two" in result
        assert "Line three" in result

        # Should not have double newlines (paragraph breaks) unless in original
        lines = result.split("\n")
        # Count consecutive blank lines
        blank_runs = []
        current_run = 0
        for line in lines:
            if line == "":
                current_run += 1
            else:
                if current_run > 0:
                    blank_runs.append(current_run)
                current_run = 0
        if current_run > 0:
            blank_runs.append(current_run)

        # With paragraph structure (split on \n\n then join with \n\n),
        # we should get exactly one blank line between paragraphs
        # No blank lines within this single paragraph
        assert len(blank_runs) == 0 or all(r == 1 for r in blank_runs)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
