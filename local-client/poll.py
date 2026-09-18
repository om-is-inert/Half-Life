"""
poll.py — Result poller for Half-Life diagnosis jobs.

Polls GET /report/{jobId} on API Gateway every N seconds until the job
status is COMPLETE (or FAILED), then renders the report in the terminal
using Rich formatting.
"""

from __future__ import annotations

import os
import time

import requests
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.text import Text

console = Console()

DEFAULT_API_BASE_URL = os.getenv(
    "HALFLIFE_API_URL", "https://REPLACE_ME.execute-api.us-east-1.amazonaws.com/prod"
)

POLL_INTERVAL_S = 5
MAX_WAIT_S = 600  # 10 minutes max


def _health_color(pct: int | None) -> str:
    if pct is None:
        return "white"
    if pct >= 80:
        return "green"
    if pct >= 60:
        return "yellow"
    return "red"


def _confidence_bar(conf: float) -> str:
    filled = int(conf * 20)
    empty = 20 - filled
    return f"[{'█' * filled}{'░' * empty}] {conf:.0%}"


def render_report(report: dict) -> None:
    """Pretty-print the final diagnosis report in the terminal."""
    console.print()

    # ── Header ───────────────────────────────────────────────────────────────
    console.rule("[bold cyan]⚡ HALF-LIFE DIAGNOSIS REPORT[/bold cyan]")

    # ── Battery Health ────────────────────────────────────────────────────────
    pct = report.get("battery_health_pct")
    color = _health_color(pct)
    battery_str = f"[{color}]{pct}%[/{color}]" if pct is not None else "[dim]Unknown[/dim]"

    # ── Summary Table ─────────────────────────────────────────────────────────
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Field", style="bold dim", width=24)
    table.add_column("Value")

    table.add_row("Battery Health", battery_str)
    table.add_row("Root Cause", f"[bold]{report.get('root_cause', 'unknown')}[/bold]")
    table.add_row(
        "Offending Package",
        report.get("offending_package") or "[dim]None detected[/dim]",
    )
    table.add_row(
        "Crashes (24 h)",
        str(report.get("crash_count_24h", "N/A")),
    )
    table.add_row("Thermal Events", str(report.get("thermal_events", 0)))
    table.add_row(
        "CPU Offender",
        report.get("cpu_offender") or "[dim]None[/dim]",
    )
    table.add_row(
        "Wakelock Offender",
        report.get("wakelock_offender") or "[dim]None[/dim]",
    )
    table.add_row(
        "Confidence",
        _confidence_bar(report.get("confidence", 0.0)),
    )

    console.print(Panel(table, title="[bold]Summary[/bold]", border_style="cyan"))

    # ── Diagnosis ─────────────────────────────────────────────────────────────
    summary = report.get("diagnosis_summary", "No summary available.")
    console.print(Panel(Text(summary), title="[bold]Diagnosis[/bold]", border_style="yellow"))

    # ── Recommended Action ────────────────────────────────────────────────────
    action = report.get("recommended_action", "none")
    adb_cmd = report.get("adb_command")

    action_text = Text()
    action_text.append(f"Action: ", style="bold")
    action_text.append(action, style="bold magenta")
    if adb_cmd:
        action_text.append("\n\nADB Command:\n", style="bold")
        action_text.append(adb_cmd, style="bold green on black")

    console.print(
        Panel(action_text, title="[bold]Recommended Fix[/bold]", border_style="magenta")
    )

    # ── Evidence Snippets ─────────────────────────────────────────────────────
    snippets = report.get("evidence_snippets", [])
    if snippets:
        ev_text = "\n".join(f"  • {s}" for s in snippets)
        console.print(
            Panel(ev_text, title="[bold]Evidence from Logs[/bold]", border_style="dim")
        )

    console.rule()
    console.print()


def poll_until_complete(
    job_id: str,
    api_base_url: str = DEFAULT_API_BASE_URL,
    poll_interval: int = POLL_INTERVAL_S,
    max_wait: int = MAX_WAIT_S,
) -> dict:
    """
    Poll GET /report/{jobId} until status == COMPLETE or FAILED.

    Returns:
        The final report dict from DynamoDB.

    Raises:
        TimeoutError: If the job does not complete within max_wait seconds.
        RuntimeError: If the job fails.
    """
    endpoint = f"{api_base_url.rstrip('/')}/report/{job_id}"
    elapsed = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(
            f"Waiting for diagnosis of job [bold]{job_id}[/bold]…", total=None
        )

        while elapsed < max_wait:
            try:
                resp = requests.get(endpoint, timeout=10)
                resp.raise_for_status()
                data = resp.json()
            except requests.RequestException as exc:
                progress.update(task, description=f"Poll error: {exc} — retrying…")
                time.sleep(poll_interval)
                elapsed += poll_interval
                continue

            status = data.get("status", "UNKNOWN")
            progress.update(task, description=f"Status: [bold]{status}[/bold] — waiting…")

            if status == "COMPLETE":
                return data.get("report", data)
            if status == "FAILED":
                raise RuntimeError(
                    f"Job {job_id} failed: {data.get('error', 'unknown error')}"
                )

            time.sleep(poll_interval)
            elapsed += poll_interval

    raise TimeoutError(
        f"Job {job_id} did not complete within {max_wait}s. "
        f"Check CloudWatch logs for Lambda errors."
    )
