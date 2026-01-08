#!/usr/bin/env python3
"""Tests for email-canvas.py"""

import os
import sys

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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
