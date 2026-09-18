"""
get_report/handler.py — Lambda: Fetch diagnosis report by job ID.

Triggered by: GET /report/{jobId} (API Gateway)
Returns the current job status and, if COMPLETE, the full report JSON.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from utils import get_job


def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Content-Type": "application/json",
    }


def handler(event: dict, context) -> dict:
    """Lambda entry point."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": _cors_headers(), "body": ""}

    path_params = event.get("pathParameters") or {}
    job_id: str = path_params.get("jobId", "")

    if not job_id:
        return {
            "statusCode": 400,
            "headers": _cors_headers(),
            "body": json.dumps({"error": "Missing jobId path parameter"}),
        }

    item = get_job(job_id)
    if item is None:
        return {
            "statusCode": 404,
            "headers": _cors_headers(),
            "body": json.dumps({"error": f"Job '{job_id}' not found"}),
        }

    status: str = item.get("status", "UNKNOWN")
    response_body: dict = {
        "jobId": job_id,
        "status": status,
        "deviceId": item.get("device_id"),
        "createdAt": item.get("created_at"),
    }

    if status == "COMPLETE":
        raw_report = item.get("report", "{}")
        try:
            response_body["report"] = json.loads(raw_report)
        except json.JSONDecodeError:
            response_body["report"] = raw_report

    elif status == "FAILED":
        response_body["error"] = item.get("error", "Unknown error")

    elif status in ("PROCESSING", "FORMATTING"):
        response_body["message"] = (
            "Diagnosis in progress. Poll again in a few seconds."
        )

    return {
        "statusCode": 200,
        "headers": _cors_headers(),
        "body": json.dumps(response_body, default=str),
    }
