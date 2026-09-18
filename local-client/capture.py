"""
capture.py — Android log extraction via ADB.

Detects connected device, runs a bounded capture of:
  - adb bugreport (optional, slow)
  - dumpsys battery / batterystats / thermal_service
  - adb logcat -d (crash/ANR/system tags only)

Saves output to logs/<device_id>_<timestamp>.txt (max 100 MB).
"""

from __future__ import annotations

import os
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

console = Console()

# Maximum raw log size allowed before we stop capturing (100 MB)
MAX_LOG_BYTES = 100 * 1024 * 1024

# Logcat tags to capture (crash, ANR, thermal, wakelock signals)
LOGCAT_TAGS = [
    "AndroidRuntime:E",
    "ActivityManager:W",
    "ActivityManager:E",
    "ActivityThread:E",
    "System.err:W",
    "StrictMode:E",
    "WatchdogChecker:E",
    "Watchdog:E",
    "ANRManager:E",
    "thermal:W",
    "ThermalService:W",
    "BatteryStats:W",
    "BatteryService:W",
    "PowerManagerService:W",
    "WakeLock:W",
    "BatteryStatsService:W",
    "*:S",  # silence everything else not listed
]

# dumpsys subsystems to collect
DUMPSYS_SERVICES = [
    "battery",
    "batterystats",
    "thermal_service",
    "power",
    "cpuinfo",
    "meminfo",
    "procstats",
    "activity",
]

LOGS_DIR = Path(__file__).parent / "logs"


def _run(cmd: list[str], timeout: int = 120) -> str:
    """Run a subprocess and return stdout as string. Raises on non-zero exit."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        return result.stdout
    except subprocess.TimeoutExpired:
        console.print(f"[yellow]⏱  Timed out: {' '.join(cmd)[:80]}[/yellow]")
        return ""
    except FileNotFoundError:
        console.print(f"[red]✗ Command not found: {cmd[0]}[/red]")
        raise


def list_devices() -> list[str]:
    """Return a list of connected ADB device serials."""
    output = _run(["adb", "devices"])
    devices = []
    for line in output.splitlines()[1:]:
        parts = line.strip().split()
        if len(parts) >= 2 and parts[1] == "device":
            devices.append(parts[0])
    return devices


def select_device(serial: Optional[str] = None) -> str:
    """
    Return the ADB serial to use.
    If serial is given, validate it exists.
    Otherwise auto-select if exactly one device is connected.
    """
    devices = list_devices()
    if not devices:
        raise RuntimeError(
            "No Android devices detected. Connect a device with USB debugging enabled."
        )
    if serial:
        if serial not in devices:
            raise RuntimeError(f"Device '{serial}' not found. Available: {devices}")
        return serial
    if len(devices) > 1:
        console.print("[bold]Multiple devices detected:[/bold]")
        for i, d in enumerate(devices):
            console.print(f"  [{i}] {d}")
        idx = int(console.input("Select device index: "))
        return devices[idx]
    return devices[0]


def capture(
    serial: Optional[str] = None,
    duration: int = 60,
    include_bugreport: bool = False,
) -> Path:
    """
    Run a full log capture for the given device and duration.

    Args:
        serial:           ADB device serial (auto-detected if None).
        duration:         Time in seconds to capture logcat stream.
        include_bugreport: Whether to run adb bugreport (slow, 1-5 min).

    Returns:
        Path to the saved log file.
    """
    serial = select_device(serial)
    adb = ["adb", "-s", serial]

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    safe_serial = serial.replace(":", "_").replace(".", "_")
    out_path = LOGS_DIR / f"{safe_serial}_{timestamp}.txt"

    console.print(f"\n[bold cyan]📱 Device:[/bold cyan] {serial}")
    console.print(f"[bold cyan]📄 Output:[/bold cyan] {out_path}\n")

    sections: list[str] = []

    # ------------------------------------------------------------------
    # 1. dumpsys sections
    # ------------------------------------------------------------------
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Collecting dumpsys sections…", total=len(DUMPSYS_SERVICES))
        for service in DUMPSYS_SERVICES:
            progress.update(task, description=f"dumpsys {service}")
            out = _run(adb + ["shell", "dumpsys", service], timeout=30)
            sections.append(f"\n\n{'='*60}\n=== DUMPSYS {service.upper()} ===\n{'='*60}\n")
            sections.append(out[:2_000_000])  # cap per service at 2 MB
            progress.advance(task)

    # ------------------------------------------------------------------
    # 2. Logcat bounded capture
    # ------------------------------------------------------------------
    console.print(f"[bold cyan]⏱  Capturing logcat for {duration}s…[/bold cyan]")
    logcat_cmd = adb + ["logcat", "-d", "-v", "threadtime"] + LOGCAT_TAGS
    logcat_start = time.time()
    logcat_output = ""
    try:
        proc = subprocess.Popen(
            logcat_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        lines = []
        while time.time() - logcat_start < duration:
            line = proc.stdout.readline()
            if not line:
                break
            lines.append(line)
            if sum(len(l) for l in lines) > 20 * 1024 * 1024:  # 20 MB cap for logcat
                console.print("[yellow]⚠ Logcat 20 MB cap reached, stopping early[/yellow]")
                break
        proc.terminate()
        logcat_output = "".join(lines)
    except Exception as exc:
        console.print(f"[yellow]⚠ Logcat capture error: {exc}[/yellow]")

    sections.append(f"\n\n{'='*60}\n=== LOGCAT (filtered, last {duration}s) ===\n{'='*60}\n")
    sections.append(logcat_output)

    # ------------------------------------------------------------------
    # 3. Optional bugreport
    # ------------------------------------------------------------------
    if include_bugreport:
        console.print("[bold cyan]📦 Running adb bugreport (this may take 1-5 min)…[/bold cyan]")
        br_out = _run(adb + ["bugreport"], timeout=360)
        sections.append(f"\n\n{'='*60}\n=== BUGREPORT ===\n{'='*60}\n")
        sections.append(br_out[:30_000_000])  # 30 MB cap for bugreport section

    # ------------------------------------------------------------------
    # 4. Write to file, enforce 100 MB cap
    # ------------------------------------------------------------------
    full_text = "".join(sections)
    if len(full_text.encode("utf-8")) > MAX_LOG_BYTES:
        console.print(
            f"[yellow]⚠ Log exceeds 100 MB, truncating to fit.[/yellow]"
        )
        full_text = full_text[: MAX_LOG_BYTES // 2]  # rough char estimate

    out_path.write_text(full_text, encoding="utf-8")
    size_mb = out_path.stat().st_size / (1024 * 1024)
    console.print(
        f"[bold green]✔ Log saved:[/bold green] {out_path} ({size_mb:.1f} MB)"
    )
    return out_path
