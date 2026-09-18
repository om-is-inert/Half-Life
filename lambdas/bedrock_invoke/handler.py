"""
bedrock_invoke/handler.py — Lambda: Invoke Claude via Bedrock for diagnosis.

Receives: { "jobId": "...", "chunks": ["...", ...] }

For single-chunk logs:
  - Sends directly to Claude with the system prompt.

For multi-chunk logs:
  - Diagnoses each chunk independently.
  - Does a final synthesis pass with all per-chunk JSON summaries.

Retries up to 3× on malformed JSON responses.
Writes final Bedrock JSON to DynamoDB and invokes FormatterLambda async.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from utils import parse_bedrock_response, update_job

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

REGION: str = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID: str = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")
FORMATTER_LAMBDA: str = os.environ["FORMATTER_FUNCTION"]
MAX_RETRIES: int = int(os.environ.get("BEDROCK_MAX_RETRIES", "3"))
MAX_TOKENS: int = int(os.environ.get("BEDROCK_MAX_TOKENS", "2048"))

bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)
lambda_client = boto3.client("lambda", region_name=REGION)

# Load system prompt from the bundled prompts file
_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "system_prompt.md"
try:
    SYSTEM_PROMPT: str = _PROMPT_PATH.read_text(encoding="utf-8")
except FileNotFoundError:
    # Fallback if running in Lambda without the prompts dir
    SYSTEM_PROMPT = (
        "You are a senior Android systems engineer. Analyse the log and respond ONLY "
        "in valid JSON matching the schema specified in the user message."
    )

# ---------------------------------------------------------------------------
# Synthesis prompt (used when there are multiple chunks)
# ---------------------------------------------------------------------------

SYNTHESIS_PROMPT = """You are given multiple partial diagnosis results (as JSON) from different sections of the same Android device log.

Synthesize them into a single final diagnosis JSON. Use the most severe/highest-confidence findings. Merge evidence_snippets from all chunks (keep best 3). Set confidence as the weighted average.

Partial diagnoses:
{partial_diagnoses}

Respond ONLY in valid JSON matching the original schema."""


def _invoke_bedrock(user_message: str, retry: int = 0) -> dict:
    """
    Call Claude via Bedrock and return a validated diagnosis dict.
    Retries up to MAX_RETRIES on malformed JSON.
    """
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": user_message}
        ],
    }

    for attempt in range(MAX_RETRIES):
        try:
            response = bedrock_runtime.invoke_model(
                modelId=MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            response_body = json.loads(response["body"].read())
            raw_text: str = response_body["content"][0]["text"]
            print(f"[bedrock_invoke] Attempt {attempt + 1}: raw response length = {len(raw_text)}")

            return parse_bedrock_response(raw_text)

        except ValueError as exc:
            print(f"[bedrock_invoke] Attempt {attempt + 1} failed validation: {exc}")
            if attempt == MAX_RETRIES - 1:
                raise
            # Add explicit retry instruction to the next attempt
            body["messages"].append(
                {"role": "assistant", "content": raw_text}
            )
            body["messages"].append({
                "role": "user",
                "content": (
                    f"Your previous response was not valid JSON matching the schema. "
                    f"Error: {exc}. Please respond ONLY with the corrected JSON object."
                )
            })
            time.sleep(1)

        except bedrock_runtime.exceptions.ThrottlingException:
            wait = 2 ** attempt
            print(f"[bedrock_invoke] Throttled, waiting {wait}s…")
            time.sleep(wait)

    raise RuntimeError("Failed to get valid Bedrock response after retries")


def handler(event: dict, context) -> dict:
    """Lambda entry point."""
    job_id: str = event["jobId"]
    chunks: list[str] = event["chunks"]

    print(f"[bedrock_invoke] job={job_id}, chunks={len(chunks)}")

    try:
        if len(chunks) == 1:
            # ── Single-chunk path ──────────────────────────────────────────
            diagnosis = _invoke_bedrock(
                f"Analyse this Android device log and provide a diagnosis:\n\n{chunks[0]}"
            )

        else:
            # ── Multi-chunk path: diagnose each chunk, then synthesise ─────
            partial_diagnoses: list[dict] = []
            for i, chunk in enumerate(chunks):
                print(f"[bedrock_invoke] Diagnosing chunk {i + 1}/{len(chunks)}")
                partial = _invoke_bedrock(
                    f"[CHUNK {i + 1} of {len(chunks)}] Analyse this Android log section:\n\n{chunk}"
                )
                partial_diagnoses.append(partial)

            # Final synthesis pass
            synthesis_input = SYNTHESIS_PROMPT.format(
                partial_diagnoses=json.dumps(partial_diagnoses, indent=2)
            )
            diagnosis = _invoke_bedrock(synthesis_input)

        print(f"[bedrock_invoke] Diagnosis complete: root_cause={diagnosis.get('root_cause')}")

        # ── Write raw Bedrock result to DynamoDB ─────────────────────────────
        update_job(
            job_id,
            bedrock_result=json.dumps(diagnosis),
            status="FORMATTING",
        )

        # ── Invoke FormatterLambda async ─────────────────────────────────────
        lambda_client.invoke(
            FunctionName=FORMATTER_LAMBDA,
            InvocationType="Event",
            Payload=json.dumps({"jobId": job_id, "diagnosis": diagnosis}).encode(),
        )

        return {"statusCode": 200, "jobId": job_id}

    except Exception as exc:
        print(f"[bedrock_invoke] FAILED for job {job_id}: {exc}")
        update_job(job_id, status="FAILED", error=str(exc))
        return {"statusCode": 500, "error": str(exc)}
