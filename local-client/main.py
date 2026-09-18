"""
main.py — Half-Life: AI-Powered Hardware Triage
Entry point for the local client.

Usage:
  python main.py [OPTIONS]

Options:
  --device   <serial>   ADB device serial (auto-detected if one device connected)
  --duration <seconds>  Logcat capture duration in seconds (default: 60)
  --bugreport           Also run adb bugreport (slow, optional)
  --api-url  <url>      Override the API Gateway base URL
  --no-scrub            Skip PII scrubbing (not recommended)
  --skip-capture <path> Use an existing log file instead of capturing
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from rich.console import Console

console = Console()


def _banner():
    console.print(
        """
[bold cyan]
  ██╗  ██╗ █████╗ ██╗     ███████╗      ██╗     ██╗███████╗███████╗
  ██║  ██║██╔══██╗██║     ██╔════╝      ██║     ██║██╔════╝██╔════╝
  ███████║███████║██║     █████╗        ██║     ██║█████╗  █████╗
  ██╔══██║██╔══██║██║     ██╔══╝        ██║     ██║██╔══╝  ██╔══╝
  ██║  ██║██║  ██║███████╗██║           ███████╗██║██║     ███████╗
  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝           ╚══════╝╚═╝╚═╝     ╚══════╝
[/bold cyan]
[dim]  AI-Powered Android Hardware Triage — powered by AWS Bedrock + Claude[/dim]
"""
    )


def main():
    _banner()

    parser = argparse.ArgumentParser(
        description="Half-Life: AI-Powered Android Hardware Triage"
    )
    parser.add_argument("--device", help="ADB device serial")
    parser.add_argument(
        "--duration",
        type=int,
        default=60,
        help="Logcat capture duration in seconds (default: 60)",
    )
    parser.add_argument(
        "--bugreport",
        action="store_true",
        help="Also run adb bugreport (slow, ~2-5 min)",
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv(
            "HALFLIFE_API_URL",
            "https://REPLACE_ME.execute-api.us-east-1.amazonaws.com/prod",
        ),
        help="API Gateway base URL",
    )
    parser.add_argument(
        "--no-scrub",
        action="store_true",
        help="Skip PII scrubbing (not recommended)",
    )
    parser.add_argument(
        "--skip-capture",
        metavar="PATH",
        help="Use an existing log file instead of capturing from device",
    )
    args = parser.parse_args()

    # Lazy imports so --help works without dependencies installed
    from capture import capture, select_device
    from scrub import scrub_file
    from upload import request_and_upload
    from poll import poll_until_complete, render_report

    # ── Step 1: Capture (or load existing file) ────────────────────────────
    if args.skip_capture:
        log_path = Path(args.skip_capture)
        if not log_path.exists():
            console.print(f"[red]✗ File not found: {log_path}[/red]")
            sys.exit(1)
        device_id = log_path.stem.split("_")[0]
        console.print(f"[cyan]→ Using existing log file: {log_path}[/cyan]")
    else:
        console.rule("[bold]Step 1 — Capturing Android Logs[/bold]")
        try:
            device_id = select_device(args.device)
            log_path = capture(
                serial=device_id,
                duration=args.duration,
                include_bugreport=args.bugreport,
            )
        except RuntimeError as exc:
            console.print(f"[red]✗ Capture failed: {exc}[/red]")
            sys.exit(1)

    # ── Step 2: PII Scrub ──────────────────────────────────────────────────
    if args.no_scrub:
        console.print("[yellow]⚠ PII scrubbing skipped.[/yellow]")
        scrubbed_path = log_path
    else:
        console.rule("[bold]Step 2 — Scrubbing PII[/bold]")
        scrubbed_path_str = scrub_file(str(log_path), verbose=True)
        scrubbed_path = Path(scrubbed_path_str)

    # ── Step 3: Upload ─────────────────────────────────────────────────────
    console.rule("[bold]Step 3 — Uploading to AWS[/bold]")
    try:
        job_id = request_and_upload(
            file_path=scrubbed_path,
            device_id=device_id,
            api_base_url=args.api_url,
        )
    except Exception as exc:
        console.print(f"[red]✗ Upload failed: {exc}[/red]")
        console.print(
            "[dim]Make sure HALFLIFE_API_URL is set correctly and the stack is deployed.[/dim]"
        )
        sys.exit(1)

    # ── Step 4: Poll for result ────────────────────────────────────────────
    console.rule("[bold]Step 4 — Waiting for AI Diagnosis[/bold]")
    try:
        report = poll_until_complete(job_id=job_id, api_base_url=args.api_url)
    except (TimeoutError, RuntimeError) as exc:
        console.print(f"[red]✗ Diagnosis failed: {exc}[/red]")
        sys.exit(1)

    # ── Step 5: Render report ──────────────────────────────────────────────
    console.rule("[bold]Step 5 — Diagnosis Complete[/bold]")
    render_report(report)

    # Optionally launch the web dashboard
    console.print(
        "[dim]Tip: Run [bold]python ../dashboard/app.py[/bold] and open "
        f"[bold]http://localhost:5000/status/{job_id}[/bold] for the visual dashboard.[/dim]\n"
    )


if __name__ == "__main__":
    main()
