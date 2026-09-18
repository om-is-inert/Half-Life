"""
tests/test_preprocessor.py — Unit tests for preprocessing and chunking logic.
"""

import sys
import os
from pathlib import Path

# Make the shared utils importable without a Lambda environment
sys.path.insert(0, str(Path(__file__).parent.parent / "lambdas" / "shared"))

import pytest
from utils import chunk_log

# ---------------------------------------------------------------------------
# Fixtures path
# ---------------------------------------------------------------------------
FIXTURES = Path(__file__).parent / "fixtures"


def read_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# chunk_log tests
# ---------------------------------------------------------------------------

class TestChunkLog:
    def test_short_log_returns_single_chunk(self):
        text = "A" * 1000
        chunks = chunk_log(text, max_chars=600_000)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_empty_text_returns_one_chunk(self):
        chunks = chunk_log("", max_chars=600_000)
        assert len(chunks) == 1

    def test_long_log_is_split(self):
        text = "X" * 1_200_001
        chunks = chunk_log(text, max_chars=600_000)
        assert len(chunks) >= 2
        for chunk in chunks:
            assert len(chunk) <= 600_000

    def test_no_chunk_exceeds_max(self):
        text = "Y" * 3_000_000
        chunks = chunk_log(text, max_chars=600_000)
        for chunk in chunks:
            assert len(chunk) <= 600_000

    def test_section_boundary_splitting(self):
        # Each section is ~750 chars; use a 2000-char max to force a split
        section = "=" * 60 + "\n=== SECTION A ===\n" + "=" * 60 + "\n" + "content\n" * 80
        text = section * 10  # ~7500 chars total, forces multiple chunks at 2000-char max
        chunks = chunk_log(text, max_chars=2000)
        assert len(chunks) >= 2

    def test_all_content_preserved(self):
        """Total characters across all chunks must equal original (modulo split boundaries)."""
        text = "Z" * 1_800_000
        chunks = chunk_log(text, max_chars=600_000)
        total = sum(len(c) for c in chunks)
        assert total == len(text)


# ---------------------------------------------------------------------------
# Preprocessor extraction tests (using fixture files)
# ---------------------------------------------------------------------------

class TestPreprocessorExtraction:
    def _import_handler(self):
        """Import preprocessor handler module with Lambda env vars mocked."""
        os.environ.setdefault("BEDROCK_INVOKE_FUNCTION", "mock-fn")
        os.environ.setdefault("S3_BUCKET", "mock-bucket")
        os.environ.setdefault("DYNAMODB_TABLE", "mock-table")
        sys.path.insert(
            0, str(Path(__file__).parent.parent / "lambdas" / "preprocessor")
        )
        import handler as pp
        return pp

    def test_strip_noise_removes_choreographer(self):
        pp = self._import_handler()
        noisy = "09-18 08:00 Choreographer: Skipping 60 frames\nReal content here\n"
        result = pp._strip_noise(noisy)
        assert "Choreographer" not in result
        assert "Real content here" in result

    def test_strip_noise_collapses_blank_lines(self):
        pp = self._import_handler()
        text = "line1\n\n\n\n\nline2"
        result = pp._strip_noise(text)
        assert "\n\n\n" not in result

    def test_extract_priority_battery_section(self):
        pp = self._import_handler()
        text = read_fixture("battery_degraded.txt")
        result = pp._extract_priority_sections(text)
        assert "PRIORITY: BATTERY_STATS" in result

    def test_extract_priority_thermal_section(self):
        pp = self._import_handler()
        text = read_fixture("overheating.txt")
        result = pp._extract_priority_sections(text)
        assert "PRIORITY: THERMAL" in result

    def test_extract_priority_crashes_from_rogue(self):
        pp = self._import_handler()
        text = read_fixture("rogue_app.txt")
        result = pp._extract_priority_sections(text)
        assert "FATAL EXCEPTION" in result or "PRIORITY: CRASHES_ANR" in result
