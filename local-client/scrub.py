"""
scrub.py — PII scrubber for Android log dumps.

Strips IMEI, IMSI, phone numbers, MAC addresses, email addresses,
serial numbers, and common contact-name patterns from raw log text
before it leaves the device or is uploaded to the cloud.
"""

import re
from typing import Optional


# ---------------------------------------------------------------------------
# Compiled regex patterns
# ---------------------------------------------------------------------------

_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    (
        "IMEI",
        re.compile(r"\b(?:IMEI|imei)[:\s=]*\d{15}\b", re.IGNORECASE),
        "[IMEI_REDACTED]",
    ),
    (
        "IMSI",
        re.compile(r"\b(?:IMSI|imsi)[:\s=]*\d{15}\b", re.IGNORECASE),
        "[IMSI_REDACTED]",
    ),
    (
        "Serial",
        re.compile(
            r"\b(?:serial(?:no|_no|number)?|ro\.serialno)[:\s=]*[A-Z0-9]{8,20}\b",
            re.IGNORECASE,
        ),
        "[SERIAL_REDACTED]",
    ),
    (
        "PhoneNumber_E164",
        re.compile(r"\+?1?\s*[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
        "[PHONE_REDACTED]",
    ),
    (
        "PhoneNumber_Intl",
        re.compile(r"\+\d{1,3}[\s-]?\d{6,14}\b"),
        "[PHONE_REDACTED]",
    ),
    (
        "Email",
        re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", re.IGNORECASE),
        "[EMAIL_REDACTED]",
    ),
    (
        "MAC_Address",
        re.compile(r"\b([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b"),
        "[MAC_REDACTED]",
    ),
    (
        "IPv4_Private",
        # Only scrub private/RFC1918 addresses
        re.compile(
            r"\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
            r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
            r"|192\.168\.\d{1,3}\.\d{1,3})\b"
        ),
        "[PRIVATE_IP_REDACTED]",
    ),
    (
        "MSISDN_Tag",
        re.compile(r"(?:msisdn|mdn|min)[:\s=]*[\d\+\-\s]{7,15}", re.IGNORECASE),
        "[MSISDN_REDACTED]",
    ),
    (
        "AccountName",
        re.compile(
            r"(?:account(?:_name|Name)?|ownerName|owner_name)[:\s\"=]+[^\s\",;\n]{3,64}",
            re.IGNORECASE,
        ),
        "[ACCOUNT_REDACTED]",
    ),
]


def scrub(text: str, *, verbose: bool = False) -> tuple[str, dict[str, int]]:
    """
    Scrub PII from *text* and return (scrubbed_text, stats_dict).

    Args:
        text:    Raw log text to sanitise.
        verbose: If True, print a summary of replacements to stdout.

    Returns:
        A tuple of (scrubbed_text, {pattern_name: replacement_count}).
    """
    stats: dict[str, int] = {}
    for name, pattern, replacement in _PATTERNS:
        new_text, n = pattern.subn(replacement, text)
        text = new_text
        if n:
            stats[name] = n

    if verbose:
        if stats:
            print("[scrub] Replacements made:")
            for k, v in stats.items():
                print(f"  {k}: {v}")
        else:
            print("[scrub] No PII patterns detected.")

    return text, stats


def scrub_file(path: str, output_path: Optional[str] = None, *, verbose: bool = True) -> str:
    """
    Scrub PII from a file on disk.

    Args:
        path:        Input file path.
        output_path: Where to write scrubbed output. Defaults to path + '.scrubbed'.
        verbose:     Print replacement stats.

    Returns:
        The output file path.
    """
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        raw = fh.read()

    scrubbed, stats = scrub(raw, verbose=verbose)

    if output_path is None:
        output_path = path + ".scrubbed"

    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(scrubbed)

    return output_path
