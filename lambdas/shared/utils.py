"""
shared/utils.py — Shared utilities across all Half-Life Lambda functions.

Provides:
  - DynamoDB helpers (get/put/update job items)
  - JSON schema validation for Bedrock responses
  - Log chunking logic
  - Lambda-safe environment variable loading
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

TABLE_NAME: str = os.environ.get("DYNAMODB_TABLE", "HalfLifeJobs")
REGION: str = os.environ.get("AWS_REGION", "us-east-1")

# Maximum characters per Bedrock chunk (~180K tokens × ~4 chars/token = 720K chars)
# We stay conservative at 600K chars to leave room for the system prompt.
MAX_CHUNK_CHARS: int = int(os.environ.get("MAX_CHUNK_CHARS", 600_000))

# ---------------------------------------------------------------------------
# DynamoDB client (lazy singleton)
# ---------------------------------------------------------------------------

_dynamodb = None


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=REGION)
    return _dynamodb.Table(TABLE_NAME)


# ---------------------------------------------------------------------------
# DynamoDB helpers
# ---------------------------------------------------------------------------

def put_job(job_id: str, **fields) -> None:
    """Create a new job item in DynamoDB."""
    item = {"jobId": job_id, **fields}
    _get_table().put_item(Item=item)


def update_job(job_id: str, **fields) -> None:
    """Update arbitrary fields on an existing job item."""
    table = _get_table()
    update_expr_parts = []
    expr_attr_names: dict[str, str] = {}
    expr_attr_values: dict[str, Any] = {}

    for i, (k, v) in enumerate(fields.items()):
        placeholder = f"#f{i}"
        value_key = f":v{i}"
        expr_attr_names[placeholder] = k
        expr_attr_values[value_key] = v
        update_expr_parts.append(f"{placeholder} = {value_key}")

    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeNames=expr_attr_names,
        ExpressionAttributeValues=expr_attr_values,
    )


def get_job(job_id: str) -> dict | None:
    """Fetch a job item from DynamoDB. Returns None if not found."""
    resp = _get_table().get_item(Key={"jobId": job_id})
    return resp.get("Item")


# ---------------------------------------------------------------------------
# JSON schema validation for Bedrock responses
# ---------------------------------------------------------------------------

REQUIRED_FIELDS = {
    "battery_health_pct",
    "root_cause",
    "offending_package",
    "crash_count_24h",
    "thermal_events",
    "wakelock_offender",
    "cpu_offender",
    "diagnosis_summary",
    "recommended_action",
    "adb_command",
    "confidence",
    "evidence_snippets",
}

VALID_ROOT_CAUSES = {
    "battery_degradation",
    "rogue_process",
    "thermal_throttling",
    "kernel_panic",
    "driver_fault",
    "memory_pressure",
    "normal",
    "unknown",
}

VALID_ACTIONS = {
    "none",
    "force_stop_package",
    "disable_package",
    "clear_cache",
    "factory_reset",
    "battery_replacement",
    "update_firmware",
    "contact_support",
}


def extract_json(text: str) -> str:
    """
    Extract a JSON object from text that may contain markdown fences or prose.
    Handles ```json ... ``` blocks and bare JSON objects.
    """
    # Try to find a markdown fenced JSON block first
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        return fence_match.group(1)
    # Fallback: find the first { ... } block
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        return brace_match.group(0)
    return text


def validate_diagnosis(data: dict) -> tuple[bool, list[str]]:
    """
    Validate a Bedrock diagnosis response dict.

    Returns:
        (is_valid, list_of_error_messages)
    """
    errors: list[str] = []

    missing = REQUIRED_FIELDS - set(data.keys())
    if missing:
        errors.append(f"Missing fields: {missing}")

    if "root_cause" in data and data["root_cause"] not in VALID_ROOT_CAUSES:
        errors.append(
            f"Invalid root_cause '{data['root_cause']}'. Must be one of {VALID_ROOT_CAUSES}"
        )

    if "recommended_action" in data and data["recommended_action"] not in VALID_ACTIONS:
        errors.append(
            f"Invalid recommended_action '{data['recommended_action']}'. Must be one of {VALID_ACTIONS}"
        )

    conf = data.get("confidence")
    if conf is not None and not (0.0 <= float(conf) <= 1.0):
        errors.append(f"confidence must be between 0.0 and 1.0, got {conf}")

    return len(errors) == 0, errors


def parse_bedrock_response(response_text: str) -> dict:
    """
    Parse and validate a Bedrock model response text into a diagnosis dict.

    Raises:
        ValueError if the response cannot be parsed or is invalid after extraction.
    """
    json_str = extract_json(response_text)
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to parse JSON from Bedrock response: {exc}\nRaw: {response_text[:500]}")

    is_valid, errors = validate_diagnosis(data)
    if not is_valid:
        raise ValueError(f"Bedrock response failed schema validation: {errors}")

    return data


# ---------------------------------------------------------------------------
# Log chunking
# ---------------------------------------------------------------------------

def chunk_log(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """
    Split a large log text into chunks that fit within the Bedrock context window.

    Attempts to split on section boundaries (=== HEADER ===) for cleaner chunks.
    Falls back to hard character splits if sections are too large.

    Returns:
        List of text chunks.
    """
    if len(text) <= max_chars:
        return [text]

    # Try to split on section headers
    section_pattern = re.compile(r"(?=\n={30,}\n=== )")
    sections = section_pattern.split(text)

    chunks: list[str] = []
    current = ""
    for section in sections:
        if len(current) + len(section) <= max_chars:
            current += section
        else:
            if current:
                chunks.append(current)
            # If the section itself is too large, hard-split it
            if len(section) > max_chars:
                for i in range(0, len(section), max_chars):
                    chunks.append(section[i : i + max_chars])
                current = ""
            else:
                current = section

    if current:
        chunks.append(current)

    return chunks or [text[:max_chars]]
