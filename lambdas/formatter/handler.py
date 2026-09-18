"""
formatter/handler.py — Lambda: Translate Bedrock JSON into human report.

Receives: { "jobId": "...", "diagnosis": { ... Bedrock JSON ... } }

Responsibilities:
  1. Enrich diagnosis_summary for readability
  2. Map recommended_action → concrete ADB command (if not already present)
  3. Build a full structured report object
  4. Write final report to DynamoDB (status → COMPLETE)
"""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from utils import update_job

# ---------------------------------------------------------------------------
# Action → ADB command mapping (overrides Bedrock's adb_command if null)
# ---------------------------------------------------------------------------

_ACTION_TO_ADB: dict[str, str | None] = {
    "none": None,
    "force_stop_package": "adb shell am force-stop {package}",
    "disable_package": "adb shell pm disable-user --user 0 {package}",
    "clear_cache": "adb shell pm clear {package}",
    "factory_reset": "adb shell am broadcast -a android.intent.action.FACTORY_RESET",
    "battery_replacement": None,  # Hardware action, no ADB command
    "update_firmware": "adb shell settings get global software_version",  # Info only
    "contact_support": None,
}

# ---------------------------------------------------------------------------
# Human-readable action labels
# ---------------------------------------------------------------------------

_ACTION_LABELS: dict[str, str] = {
    "none": "No action required — device appears healthy.",
    "force_stop_package": "Force-stop the offending application.",
    "disable_package": "Disable the offending application system-wide.",
    "clear_cache": "Clear the offending application's cache.",
    "factory_reset": "Perform a factory reset to restore the device.",
    "battery_replacement": "Replace the battery — hardware service required.",
    "update_firmware": "Update the device firmware via OEM/carrier.",
    "contact_support": "Contact OEM or carrier support for further diagnosis.",
}

# ---------------------------------------------------------------------------
# Severity classification
# ---------------------------------------------------------------------------

_SEVERITY_MAP: dict[str, str] = {
    "normal": "LOW",
    "unknown": "LOW",
    "rogue_process": "MEDIUM",
    "memory_pressure": "MEDIUM",
    "thermal_throttling": "HIGH",
    "battery_degradation": "HIGH",
    "driver_fault": "CRITICAL",
    "kernel_panic": "CRITICAL",
}


def _resolve_adb_command(action: str, package: str | None, existing_cmd: str | None) -> str | None:
    """
    Return the ADB command string for the recommended action.
    Prefers Bedrock's provided command; falls back to our template.
    """
    if existing_cmd:
        return existing_cmd

    template = _ACTION_TO_ADB.get(action)
    if template is None:
        return None
    if "{package}" in template:
        if not package:
            return None  # Can't substitute without a package name
        return template.format(package=package)
    return template


def handler(event: dict, context) -> dict:
    """Lambda entry point."""
    job_id: str = event["jobId"]
    diagnosis: dict = event["diagnosis"]

    print(f"[formatter] Formatting job {job_id}")

    action: str = diagnosis.get("recommended_action", "none")
    package: str | None = diagnosis.get("offending_package")
    existing_adb: str | None = diagnosis.get("adb_command")

    # ── Resolve ADB command ──────────────────────────────────────────────────
    adb_command = _resolve_adb_command(action, package, existing_adb)

    # ── Severity ─────────────────────────────────────────────────────────────
    root_cause = diagnosis.get("root_cause", "unknown")
    severity = _SEVERITY_MAP.get(root_cause, "LOW")

    # ── Action label ─────────────────────────────────────────────────────────
    action_label = _ACTION_LABELS.get(action, action)

    # ── Build final report ───────────────────────────────────────────────────
    report = {
        # Core diagnosis fields (pass-through from Bedrock)
        "battery_health_pct": diagnosis.get("battery_health_pct"),
        "root_cause": root_cause,
        "offending_package": package,
        "crash_count_24h": diagnosis.get("crash_count_24h"),
        "thermal_events": diagnosis.get("thermal_events", 0),
        "wakelock_offender": diagnosis.get("wakelock_offender"),
        "cpu_offender": diagnosis.get("cpu_offender"),
        "confidence": diagnosis.get("confidence", 0.0),
        "evidence_snippets": diagnosis.get("evidence_snippets", []),
        # Formatter-enriched fields
        "diagnosis_summary": diagnosis.get("diagnosis_summary", "Diagnosis unavailable."),
        "recommended_action": action,
        "action_label": action_label,
        "adb_command": adb_command,
        "severity": severity,
        "completed_at": int(time.time()),
    }

    # ── Write COMPLETE status to DynamoDB ────────────────────────────────────
    try:
        update_job(
            job_id,
            status="COMPLETE",
            report=json.dumps(report),
        )
        print(f"[formatter] Job {job_id} marked COMPLETE. severity={severity}")
    except Exception as exc:
        print(f"[formatter] DynamoDB update failed: {exc}")
        update_job(job_id, status="FAILED", error=str(exc))
        return {"statusCode": 500}

    return {"statusCode": 200, "jobId": job_id, "severity": severity}
