"""
tests/test_scrub.py — Unit tests for the PII scrubber.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "local-client"))

import pytest
from scrub import scrub, scrub_file


class TestScrubPatterns:
    def test_imei_scrubbed(self):
        text = "Device IMEI: 490154203237518"
        result, stats = scrub(text)
        assert "490154203237518" not in result
        assert "[IMEI_REDACTED]" in result
        assert stats.get("IMEI", 0) >= 1

    def test_imsi_scrubbed(self):
        text = "IMSI: 310410123456789"
        result, stats = scrub(text)
        assert "310410123456789" not in result
        assert "IMSI" in stats

    def test_us_phone_number_scrubbed(self):
        text = "Call me at (555) 867-5309"
        result, stats = scrub(text)
        assert "867-5309" not in result

    def test_e164_phone_scrubbed(self):
        text = "Contact: +14155552671"
        result, stats = scrub(text)
        assert "+14155552671" not in result

    def test_email_scrubbed(self):
        text = "Owner: alice@example.com"
        result, stats = scrub(text)
        assert "alice@example.com" not in result
        assert "[EMAIL_REDACTED]" in result

    def test_mac_address_scrubbed(self):
        text = "WiFi MAC: AA:BB:CC:DD:EE:FF"
        result, stats = scrub(text)
        assert "AA:BB:CC:DD:EE:FF" not in result
        assert "[MAC_REDACTED]" in result

    def test_private_ipv4_scrubbed(self):
        text = "Connected to router at 192.168.1.1"
        result, stats = scrub(text)
        assert "192.168.1.1" not in result

    def test_public_ipv4_not_scrubbed(self):
        """Public IP addresses should NOT be scrubbed."""
        text = "Remote server: 8.8.8.8"
        result, stats = scrub(text)
        assert "8.8.8.8" in result

    def test_clean_log_unchanged(self):
        text = "09-18 07:00:01 ActivityManager: Killing old process"
        result, stats = scrub(text)
        assert result == text
        assert not stats

    def test_multiple_patterns_in_one_line(self):
        text = "Owner alice@example.com called +14155552671 from AA:BB:CC:DD:EE:FF"
        result, stats = scrub(text)
        assert "alice@example.com" not in result
        assert "+14155552671" not in result
        assert "AA:BB:CC:DD:EE:FF" not in result
        assert len(stats) >= 3

    def test_stats_count_correct(self):
        text = "IMEI: 490154203237518\nIMEI: 490154203237519"
        result, stats = scrub(text)
        assert stats.get("IMEI", 0) == 2

    def test_scrub_file(self, tmp_path):
        """Test file-based scrubbing."""
        input_file = tmp_path / "test.txt"
        input_file.write_text("IMEI: 490154203237518\nNormal log line", encoding="utf-8")

        output_path = scrub_file(str(input_file), verbose=False)
        output = Path(output_path).read_text(encoding="utf-8")
        assert "490154203237518" not in output
        assert "Normal log line" in output
