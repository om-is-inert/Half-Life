"""
upload.py — Presigned S3 upload for Half-Life log files.

1. Calls POST /get-upload-url on API Gateway to obtain a presigned PUT URL + job ID.
2. PUTs the scrubbed log file directly to S3 via the presigned URL.
3. Returns the job ID for downstream polling.
"""

from __future__ import annotations

import os
from pathlib import Path

import requests
from rich.console import Console
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    TextColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)

console = Console()

# ---------------------------------------------------------------------------
# Configuration — override via environment variables or pass directly
# ---------------------------------------------------------------------------

DEFAULT_API_BASE_URL = os.getenv(
    "HALFLIFE_API_URL", "https://REPLACE_ME.execute-api.us-east-1.amazonaws.com/prod"
)


def get_presigned_url(
    api_base_url: str,
    device_id: str,
    filename: str,
) -> tuple[str, str]:
    """
    Request a presigned S3 PUT URL from the API Gateway.

    Args:
        api_base_url: Base URL of the deployed API Gateway stage.
        device_id:    ADB serial of the source device.
        filename:     Local filename (used as S3 object key hint).

    Returns:
        (presigned_url, job_id)
    """
    endpoint = f"{api_base_url.rstrip('/')}/get-upload-url"
    payload = {"device_id": device_id, "filename": filename}

    console.print(f"[cyan]→ Requesting presigned URL from {endpoint}[/cyan]")
    resp = requests.post(endpoint, json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    upload_url: str = data["uploadUrl"]
    job_id: str = data["jobId"]
    console.print(f"[green]✔ Job ID:[/green] [bold]{job_id}[/bold]")
    return upload_url, job_id


def upload_log(
    file_path: Path,
    presigned_url: str,
) -> None:
    """
    Upload a log file to S3 via a presigned PUT URL with progress display.

    Args:
        file_path:     Path to the scrubbed log file.
        presigned_url: S3 presigned PUT URL.
    """
    file_size = file_path.stat().st_size

    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        DownloadColumn(),
        TransferSpeedColumn(),
        TimeRemainingColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(f"Uploading {file_path.name}…", total=file_size)

        def _read_with_progress(chunk_size: int = 1024 * 256):
            with open(file_path, "rb") as fh:
                while True:
                    chunk = fh.read(chunk_size)
                    if not chunk:
                        break
                    progress.advance(task, len(chunk))
                    yield chunk

        headers = {
            "Content-Type": "text/plain",
            "Content-Length": str(file_size),
        }
        resp = requests.put(
            presigned_url,
            data=_read_with_progress(),
            headers=headers,
            timeout=300,
        )
        resp.raise_for_status()

    console.print("[bold green]✔ Upload complete.[/bold green]")


def request_and_upload(
    file_path: Path,
    device_id: str,
    api_base_url: str = DEFAULT_API_BASE_URL,
) -> str:
    """
    End-to-end: get presigned URL and upload the file.

    Returns:
        job_id (str)
    """
    presigned_url, job_id = get_presigned_url(
        api_base_url=api_base_url,
        device_id=device_id,
        filename=file_path.name,
    )
    upload_log(file_path=file_path, presigned_url=presigned_url)
    return job_id
