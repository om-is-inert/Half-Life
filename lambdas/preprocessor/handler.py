"""
preprocessor/handler.py — Lambda: Clean and chunk raw Android logs.

Triggered by: S3 ObjectCreated event on raw-logs bucket.
Responsibilities:
  1. Pull raw log from S3
  2. Strip noise (heartbeats, verbose spam)
  3. Extract key sections: battery, thermal, crash/ANR, CPU, wakelock
  4. Chunk if needed to fit Bedrock context window
  5. Update DynamoDB status → PROCESSING
  6. Invoke BedrockInvokeLambda asynchronously with the cleaned chunks
"""

from __future__ import annotations

import json
import os
import re
import sys

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from utils import chunk_log, update_job

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

REGION: str = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_LAMBDA: str = os.environ["BEDROCK_INVOKE_FUNCTION"]
S3_BUCKET: str = os.environ["S3_BUCKET"]

s3_client = boto3.client("s3", region_name=REGION)
lambda_client = boto3.client("lambda", region_name=REGION)

# ---------------------------------------------------------------------------
# Noise patterns to strip (compiled once at cold-start)
# ---------------------------------------------------------------------------

_NOISE_PATTERNS: list[re.Pattern] = [
    # Repeated heartbeat / keepalive lines
    re.compile(r"^.{0,80}(heartbeat|keepalive|ping|pong).{0,80}$", re.IGNORECASE | re.MULTILINE),
    # Verbose Binder/GC spam
    re.compile(r"^.{0,80}(GC_EXPLICIT|GC_FOR_ALLOC|art.*GC).{0,80}$", re.MULTILINE),
    # Vsync / choreographer spam
    re.compile(r"^.{0,80}(Choreographer|VSYNC|Skipping \d+ frames).{0,80}$", re.MULTILINE),
    # Excessive wifi scanning logs
    re.compile(r"^.{0,80}(WifiStateMachine|WifiScanner: onResults).{0,80}$", re.MULTILINE),
    # Blank lines (collapse runs of 3+ newlines to 2)
    re.compile(r"\n{3,}"),
]

# Sections we actively want to extract and prioritise
_PRIORITY_SECTION_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("battery_stats", re.compile(
        r"(=== DUMPSYS BATTERY.*?)(?===|\Z)", re.DOTALL
    )),
    ("battery_history", re.compile(
        r"(Battery History.*?)(?=\n={10}|\Z)", re.DOTALL
    )),
    ("thermal", re.compile(
        r"(=== DUMPSYS THERMAL.*?|thermal throttl.*?)(?===|\Z)", re.DOTALL | re.IGNORECASE
    )),
    ("crashes_anr", re.compile(
        r"(FATAL EXCEPTION.*?(?:\n.*?){0,30}|ANR in.*?(?:\n.*?){0,20})", re.DOTALL
    )),
    ("wakelocks", re.compile(
        r"(Wake lock.*?(?:\n.*?){0,10})", re.DOTALL | re.IGNORECASE
    )),
    ("cpu_top", re.compile(
        r"(CPU usage.*?(?:\n.*?){0,30})", re.DOTALL | re.IGNORECASE
    )),
]


def _strip_noise(text: str) -> str:
    """Remove repetitive/noisy log lines."""
    for pattern in _NOISE_PATTERNS:
        if pattern.pattern == r"\n{3,}":
            text = pattern.sub("\n\n", text)
        else:
            text = pattern.sub("", text)
    return text


def _extract_priority_sections(text: str) -> str:
    """
    Extract and concatenate high-value log sections.
    Returns a condensed string with all priority content.
    """
    parts: list[str] = []
    for name, pattern in _PRIORITY_SECTION_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            combined = "\n".join(matches[:5])  # cap at 5 matches per section
            parts.append(f"\n\n{'='*60}\n=== PRIORITY: {name.upper()} ===\n{'='*60}\n{combined}")

    # Always include the full logcat section (crash tags only) at the end
    logcat_match = re.search(r"=== LOGCAT.*", text, re.DOTALL)
    if logcat_match:
        parts.append(
            f"\n\n{'='*60}\n=== LOGCAT (crash/ANR tags) ===\n{'='*60}\n"
            + logcat_match.group(0)[:100_000]  # cap logcat at 100K chars
        )

    if parts:
        return "\n".join(parts)
    # Fallback: return the cleaned text as-is
    return text


def handler(event: dict, context) -> dict:
    """Lambda entry point — triggered by S3 ObjectCreated."""
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    # Derive job ID from the S3 key: raw-logs/<job_id>/filename.txt
    parts = key.split("/")
    if len(parts) < 3:
        print(f"[preprocessor] Unexpected S3 key format: {key}")
        return {"statusCode": 400}

    job_id = parts[1]
    print(f"[preprocessor] Processing job {job_id} from s3://{bucket}/{key}")

    # ── 1. Fetch raw log from S3 ─────────────────────────────────────────────
    try:
        obj = s3_client.get_object(Bucket=bucket, Key=key)
        raw_text: str = obj["Body"].read().decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"[preprocessor] Failed to read S3 object: {exc}")
        update_job(job_id, status="FAILED", error=str(exc))
        return {"statusCode": 500}

    print(f"[preprocessor] Raw log size: {len(raw_text):,} chars")

    # ── 2. Clean & extract ───────────────────────────────────────────────────
    cleaned = _strip_noise(raw_text)
    prioritised = _extract_priority_sections(cleaned)
    print(f"[preprocessor] After extraction: {len(prioritised):,} chars")

    # ── 3. Chunk if needed ───────────────────────────────────────────────────
    chunks = chunk_log(prioritised)
    print(f"[preprocessor] Chunks: {len(chunks)}")

    # ── 4. Update DynamoDB → PROCESSING ─────────────────────────────────────
    update_job(
        job_id,
        status="PROCESSING",
        chunk_count=len(chunks),
        raw_size=len(raw_text),
        cleaned_size=len(prioritised),
    )

    # ── 5. Invoke BedrockInvokeLambda asynchronously ─────────────────────────
    payload = {
        "jobId": job_id,
        "chunks": chunks,
    }
    try:
        lambda_client.invoke(
            FunctionName=BEDROCK_LAMBDA,
            InvocationType="Event",  # async
            Payload=json.dumps(payload).encode(),
        )
        print(f"[preprocessor] Invoked {BEDROCK_LAMBDA} async for job {job_id}")
    except Exception as exc:
        print(f"[preprocessor] Failed to invoke Bedrock lambda: {exc}")
        update_job(job_id, status="FAILED", error=str(exc))
        return {"statusCode": 500}

    return {"statusCode": 200, "jobId": job_id}
