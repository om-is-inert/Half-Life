"""
get_upload_url/handler.py — Lambda: Generate presigned S3 PUT URL.

Triggered by: POST /get-upload-url (API Gateway)
Input JSON:   { "device_id": "...", "filename": "..." }
Output JSON:  { "uploadUrl": "...", "jobId": "..." }

Also creates the initial DynamoDB job record (status: PENDING).
"""

from __future__ import annotations

import json
import os
import time
import uuid

import boto3

# Shared utils are on the Lambda layer path
import sys
sys.path.insert(0, "/opt/python")  # Lambda layer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

from utils import put_job

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

S3_BUCKET: str = os.environ["S3_BUCKET"]
REGION: str = os.environ.get("AWS_REGION", "us-east-1")
URL_EXPIRES_SECONDS: int = int(os.environ.get("PRESIGNED_EXPIRES", "900"))  # 15 min

s3_client = boto3.client("s3", region_name=REGION)


def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Content-Type": "application/json",
    }


def handler(event: dict, context) -> dict:
    """Lambda entry point."""
    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": _cors_headers(), "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": _cors_headers(),
            "body": json.dumps({"error": "Invalid JSON body"}),
        }

    device_id: str = body.get("device_id", "unknown-device")
    filename: str = body.get("filename", "log.txt")

    # Generate a unique job ID and S3 object key
    job_id = str(uuid.uuid4())
    timestamp = int(time.time())
    s3_key = f"raw-logs/{job_id}/{filename}"

    # Generate presigned PUT URL
    try:
        presigned_url: str = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": s3_key,
                "ContentType": "text/plain",
            },
            ExpiresIn=URL_EXPIRES_SECONDS,
        )
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": _cors_headers(),
            "body": json.dumps({"error": f"Failed to generate presigned URL: {str(exc)}"}),
        }

    # Create job record in DynamoDB
    try:
        put_job(
            job_id=job_id,
            status="PENDING",
            device_id=device_id,
            filename=filename,
            s3_key=s3_key,
            created_at=timestamp,
            ttl=timestamp + (7 * 24 * 3600),  # 7-day TTL
        )
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": _cors_headers(),
            "body": json.dumps({"error": f"Failed to create job record: {str(exc)}"}),
        }

    return {
        "statusCode": 200,
        "headers": _cors_headers(),
        "body": json.dumps(
            {
                "uploadUrl": presigned_url,
                "jobId": job_id,
                "s3Key": s3_key,
                "expiresIn": URL_EXPIRES_SECONDS,
            }
        ),
    }
