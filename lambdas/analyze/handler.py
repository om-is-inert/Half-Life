"""
lambdas/analyze/handler.py — Deterministic Android diagnostics parser.

Triggered by: POST /analyze (API Gateway)
Input JSON: {
    "device_id": "...",
    "battery_raw": "...",       # dumpsys battery
    "batterystats_raw": "...",  # dumpsys batterystats | head -300
    "cpuinfo_raw": "...",       # dumpsys cpuinfo | head -80
    "thermal_raw": "...",       # dumpsys thermal_service | head -60
    "connection_method": "webusb" | "paste" | "job_id"
}

Output: DiagnosisReport JSON — <100ms, exact arithmetic, zero LLM cost.

Severity thresholds:
  - CRITICAL: battery < 60%  OR  cpu offender > 50%
  - HIGH:     battery < 75%  OR  cpu offender > 30%  OR  thermal > 5
  - MEDIUM:   battery < 85%  OR  cpu offender > 15%  OR  thermal > 2
  - LOW:      everything else
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
from typing import Any

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from utils import put_job, update_job

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
REGION: str = os.environ.get("AWS_REGION", "us-east-1")


def _cors() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _int(pattern: str, text: str) -> int | None:
    m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return int(m.group(1)) if m else None


def _float(pattern: str, text: str) -> float | None:
    m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return float(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# Battery basics
# ---------------------------------------------------------------------------

HEALTH_LABELS = {
    1: "Unknown", 2: "Good", 3: "Overheat",
    4: "Dead", 5: "Over Voltage", 6: "Failure", 7: "Cold",
}


def parse_battery(raw: str) -> dict:
    health_code = _int(r"^\s*health:\s*(\d+)", raw)
    temp_raw    = _int(r"^\s*temperature:\s*(\d+)", raw)
    return {
        "level":              _int(r"^\s*level:\s*(\d+)", raw),
        "voltage_mv":         _int(r"^\s*voltage:\s*(\d+)", raw),
        "temperature_celsius": temp_raw / 10 if temp_raw is not None else None,
        "health_code":        health_code,
        "health_label":       HEALTH_LABELS.get(health_code, "Unknown") if health_code else "Unknown",
    }


# ---------------------------------------------------------------------------
# Battery capacity / wear
# ---------------------------------------------------------------------------

def parse_capacity(batterystats: str) -> dict:
    estimated = _int(r"Estimated battery capacity:\s+(\d+)\s*mAh", batterystats)
    design    = _int(r"Design(?:ed)?(?: battery)? capacity:\s+(\d+)\s*mAh",    batterystats)
    if estimated and design and design > 0:
        wear_pct = round((estimated / design) * 100)
    else:
        wear_pct = None
    return {
        "estimated_mah": estimated,
        "design_mah":    design,
        "wear_pct":      wear_pct,
    }


# ---------------------------------------------------------------------------
# Wakelock top-5
# ---------------------------------------------------------------------------

def _ms_to_label(ms: int) -> str:
    s = ms // 1000
    h = s // 3600
    m = (s % 3600) // 60
    s = s % 60
    if h: return f"{h}h {m}m"
    if m: return f"{m}m {s}s"
    return f"{s}s"


def parse_wakelocks(batterystats: str) -> list[dict]:
    results = []
    # "  Wakelock com.foo.bar: 14h 32m 3s realtime"
    pattern = re.compile(
        r"Wakelock\s+([\w./:]+):\s+(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s?).*?realtime",
        re.IGNORECASE,
    )
    for m in pattern.finditer(batterystats):
        pkg  = m.group(1)
        days = int(m.group(2) or 0)
        hrs  = int(m.group(3) or 0)
        mins = int(m.group(4) or 0)
        secs = int(m.group(5) or 0)
        ms = ((days * 24 + hrs) * 3600 + mins * 60 + secs) * 1000
        if ms > 0 and "TOTAL" not in pkg:
            results.append({"package": pkg, "duration_ms": ms, "duration_label": _ms_to_label(ms)})

    return sorted(results, key=lambda x: x["duration_ms"], reverse=True)[:5]


# ---------------------------------------------------------------------------
# CPU top-5
# ---------------------------------------------------------------------------

def parse_cpu(cpuinfo: str) -> list[dict]:
    results = []
    # e.g., "  67.5% 1234/com.example.app: 60.1% user + 7.4% kernel"
    pattern = re.compile(
        r"^\s*([\d.]+)%\s+(?:[\d]+/)?([\w.-]+)(?::.*?)?:\s*([\d.]+)%\s+user\s+\+\s*([\d.]+)%\s+kernel",
        re.MULTILINE,
    )
    for m in pattern.finditer(cpuinfo):
        pkg = m.group(2).strip()
        if pkg == "TOTAL" or not pkg:
            continue
        results.append({
            "package":    pkg,
            "total_pct":  float(m.group(1)),
            "user_pct":   float(m.group(3)),
            "kernel_pct": float(m.group(4)),
        })
    return sorted(results, key=lambda x: x["total_pct"], reverse=True)[:5]


# ---------------------------------------------------------------------------
# Thermal events
# ---------------------------------------------------------------------------

def parse_thermal(thermal: str) -> int:
    matches = re.findall(
        r"IsThrottling:\s*true|Critical Temperature:\s*true|emergency shutdown",
        thermal,
        re.IGNORECASE,
    )
    return len(matches)


# ---------------------------------------------------------------------------
# Crashes, Memory, Storage
# ---------------------------------------------------------------------------

def parse_crashes(dropbox: str) -> int:
    matches = re.findall(r"data_app_crash|data_app_anr|FATAL EXCEPTION|ANR in", dropbox, re.IGNORECASE)
    return len(matches)

def parse_memory(meminfo: str) -> dict:
    total = _int(r"Total RAM:\s*([\d]+)K", meminfo.replace(",", ""))
    free = _int(r"Free RAM:\s*([\d]+)K", meminfo.replace(",", ""))
    if total and free:
        return {"total_kb": total, "free_kb": free, "free_pct": round((free / total) * 100)}
    return {"total_kb": None, "free_kb": None, "free_pct": None}

def parse_storage(storage: str) -> dict:
    m = re.search(r"Data-Free:\s*(\d+)K\s*/\s*(\d+)K\s*total", storage, re.IGNORECASE)
    if m:
        free = int(m.group(1))
        total = int(m.group(2))
        return {"total_kb": total, "free_kb": free, "utilization_pct": 100 - round((free / total) * 100)}
    return {"total_kb": None, "free_kb": None, "utilization_pct": None}


# ---------------------------------------------------------------------------
# Severity + root cause (rule-based, deterministic)
# ---------------------------------------------------------------------------

def classify(
    wear_pct: int | None, 
    top_cpu_pct: int, 
    thermal_events: int,
    battery_level: int | None,
    has_cpu_data: bool,
    has_wl_data: bool,
    crashes: int,
    memory_free_pct: int | None,
    storage_utilization_pct: int | None
) -> dict:
    if battery_level is None and wear_pct is None and not has_cpu_data and not has_wl_data and thermal_events == 0 and crashes == 0 and memory_free_pct is None and storage_utilization_pct is None:
        return {"root_cause": "insufficient_data", "severity": "UNKNOWN"}

    root_cause = "normal"
    severity   = "LOW"

    # Storage Check
    if storage_utilization_pct is not None and storage_utilization_pct > 95:
        root_cause, severity = "storage_full", "CRITICAL"

    # Memory Check
    if memory_free_pct is not None and memory_free_pct < 10:
        root_cause = root_cause if severity == "CRITICAL" else "memory_pressure"
        if severity not in ("CRITICAL",):
            severity = "HIGH"

    # App Crash Loop
    if crashes > 5:
        root_cause = root_cause if severity == "CRITICAL" else "app_crash_loop"
        if severity not in ("CRITICAL",):
            severity = "HIGH"

    # Battery degradation check
    if wear_pct is not None:
        if wear_pct < 60:
            root_cause, severity = "battery_degradation", "CRITICAL"
        elif wear_pct < 75:
            root_cause, severity = "battery_degradation", "HIGH"
        elif wear_pct < 85:
            root_cause, severity = "battery_degradation", "MEDIUM"

    # Rogue process (CPU) — override severity if worse
    if top_cpu_pct > 50:
        root_cause = "rogue_process"
        if severity not in ("CRITICAL",):
            severity = "CRITICAL"
    elif top_cpu_pct > 30:
        root_cause = root_cause if root_cause != "normal" else "rogue_process"
        if severity not in ("CRITICAL", "HIGH"):
            severity = "HIGH"
    elif top_cpu_pct > 15:
        root_cause = root_cause if root_cause != "normal" else "rogue_process"
        if severity not in ("CRITICAL", "HIGH", "MEDIUM"):
            severity = "MEDIUM"

    # Thermal throttling
    if thermal_events >= 5:
        root_cause = root_cause if root_cause != "normal" else "thermal_throttling"
        if severity not in ("CRITICAL",):
            severity = "CRITICAL"
    elif thermal_events >= 2:
        root_cause = root_cause if root_cause != "normal" else "thermal_throttling"
        if severity not in ("CRITICAL", "HIGH"):
            severity = "HIGH"

    return {"root_cause": root_cause, "severity": severity}


# ---------------------------------------------------------------------------
# Action mapping
# ---------------------------------------------------------------------------

ACTION_MAP = {
    "rogue_process":      ("disable_package",  "Disable the offending application"),
    "battery_degradation": ("replace_battery",  "Replace the battery — hardware service required"),
    "thermal_throttling": ("force_stop_package", "Force-stop the overheating application"),
    "memory_leak":        ("clear_cache",       "Clear the offending application's cache"),
    "storage_full":       ("none",              "Delete media or unused applications"),
    "memory_pressure":    ("none",              "Close background apps to free RAM"),
    "app_crash_loop":     ("clear_cache",       "Clear cache or uninstall crashing application"),
    "insufficient_data":  ("none",              "Unlock device and authorize USB debugging"),
    "normal":             ("none",              "No action required — device is healthy"),
}

ADB_COMMANDS = {
    "disable_package":    "adb shell pm disable-user --user 0 {package}",
    "force_stop_package": "adb shell am force-stop {package}",
    "clear_cache":        "adb shell pm clear {package}",
    "replace_battery":    None,
    "none":               None,
}


def build_adb_command(action: str, package: str | None) -> str | None:
    template = ADB_COMMANDS.get(action)
    if not template:
        return None
    if "{package}" in template:
        if not package:
            return None
        return template.format(package=package)
    return template


# ---------------------------------------------------------------------------
# Diagnosis summary generator (template, not LLM)
# ---------------------------------------------------------------------------

def build_summary(
    root_cause: str,
    severity: str,
    wear_pct: int | None,
    top_package: str | None,
    top_cpu_pct: int,
    thermal_events: int,
    design_mah: int | None,
    estimated_mah: int | None,
) -> str:
    parts = []

    if root_cause == "battery_degradation":
        if design_mah and estimated_mah:
            parts.append(
                f"Your battery has degraded to approximately {wear_pct}% of its original capacity "
                f"({estimated_mah} mAh vs. the factory design of {design_mah} mAh)."
            )
        else:
            parts.append(f"Your battery health has dropped to {wear_pct}%, indicating significant wear.")
        if severity == "CRITICAL":
            parts.append("Immediate battery replacement is strongly recommended.")

    elif root_cause == "rogue_process":
        pkg = top_package or "an unknown process"
        parts.append(
            f"The process '{pkg}' is consuming {top_cpu_pct}% of CPU cycles, "
            "preventing the device from entering low-power states and accelerating battery drain."
        )
        parts.append("Force-stopping or disabling this application should resolve the drain.")

    elif root_cause == "thermal_throttling":
        parts.append(
            f"The device recorded {thermal_events} thermal throttling event(s), "
            "causing the CPU to be clocked down to reduce heat."
        )
        pkg = top_package or "a background process"
        parts.append(f"The primary heat source appears to be '{pkg}'. Consider force-stopping it.")

    elif root_cause == "insufficient_data":
        parts.append(
            "Insufficient data extracted from the device. This typically happens if the device is "
            "screen-locked, USB debugging is not authorized, or the OEM has restricted these diagnostic services."
        )

    elif root_cause == "storage_full":
        parts.append(
            "Your device's internal storage is critically full. "
            "Android systems require at least 5% free space to function properly. Please delete large media or unused apps."
        )

    elif root_cause == "memory_pressure":
        parts.append(
            "Your device is critically low on available RAM, causing background applications to be "
            "frequently killed and resulting in UI lag."
        )

    elif root_cause == "app_crash_loop":
        parts.append(
            "High frequency of application crashes and 'App Not Responding' (ANR) events detected. "
            "A specific application or system component is highly unstable."
        )

    else:
        parts.append("Your device appears to be in good health with no significant hardware or software issues detected.")

    return " ".join(parts)


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------

def handler(event: dict, context) -> dict:
    # CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": _cors(), "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {"statusCode": 400, "headers": _cors(), "body": json.dumps({"error": "Invalid JSON"})}

    device_id         = body.get("device_id", "unknown")
    battery_raw       = body.get("battery_raw", "")
    batterystats_raw  = body.get("batterystats_raw", "")
    cpuinfo_raw       = body.get("cpuinfo_raw", "")
    thermal_raw       = body.get("thermal_raw", "")
    dropbox_raw       = body.get("dropbox_raw", "")
    meminfo_raw       = body.get("meminfo_raw", "")
    storage_raw       = body.get("storage_raw", "")
    connection_method = body.get("connection_method", "paste")

    payload_size = sum(len(s) for s in [battery_raw, batterystats_raw, cpuinfo_raw, thermal_raw, dropbox_raw, meminfo_raw, storage_raw])
    print(f"[analyze] device={device_id}, payload={payload_size}B, method={connection_method}")

    if payload_size > 5 * 1024 * 1024:
        return {
            "statusCode": 413,
            "headers": _cors(),
            "body": json.dumps({"error": "Payload Too Large: exceeded 5MB limit."})
        }

    # ── Parse ──────────────────────────────────────────────────────────────────
    battery  = parse_battery(battery_raw)
    capacity = parse_capacity(batterystats_raw)
    wl_top5  = parse_wakelocks(batterystats_raw)
    cpu_top5 = parse_cpu(cpuinfo_raw)
    thermal_events = parse_thermal(thermal_raw)
    
    crashes = parse_crashes(dropbox_raw)
    memory  = parse_memory(meminfo_raw)
    storage = parse_storage(storage_raw)

    wear_pct = capacity["wear_pct"]
    
    # Find the top non-system package for rogue process evaluation
    top_cpu_pct = 0
    top_package = None
    for c in cpu_top5:
        pkg = c["package"]
        if pkg in ("system_server", "android", "TOTAL") or pkg.startswith("com.android."):
            continue
        if c["total_pct"] > top_cpu_pct:
            top_cpu_pct = c["total_pct"]
            top_package = pkg
            break

    # ── Classify ───────────────────────────────────────────────────────────────
    classification = classify(
        wear_pct, 
        top_cpu_pct, 
        thermal_events,
        battery["level"],
        len(cpu_top5) > 0,
        len(wl_top5) > 0,
        crashes,
        memory["free_pct"],
        storage["utilization_pct"]
    )
    root_cause     = classification["root_cause"]
    severity       = classification["severity"]

    action, action_label = ACTION_MAP.get(root_cause, ("none", "No action required"))
    offending_pkg = top_package if root_cause in ("rogue_process", "thermal_throttling") else None
    adb_command   = build_adb_command(action, offending_pkg)

    diagnosis_summary = build_summary(
        root_cause, severity, wear_pct,
        top_package, top_cpu_pct, thermal_events,
        capacity["design_mah"], capacity["estimated_mah"],
    )

    # ── Evidence snippets (verbatim from the raw data) ─────────────────────────
    evidence: list[str] = []
    if capacity["estimated_mah"] and capacity["design_mah"]:
        evidence.append(
            f"Estimated battery capacity: {capacity['estimated_mah']} mAh / "
            f"Design: {capacity['design_mah']} mAh"
        )
    if cpu_top5:
        c = cpu_top5[0]
        evidence.append(f"{c['total_pct']}% {c['package']}: {c['user_pct']}% user + {c['kernel_pct']}% kernel")
    if wl_top5:
        w = wl_top5[0]
        evidence.append(f"Wakelock {w['package']}: {w['duration_label']} realtime")

    # ── Build report ───────────────────────────────────────────────────────────
    now = int(time.time())
    job_id = str(uuid.uuid4())

    report = {
        "jobId":              job_id,
        "device_id":          device_id,
        "created_at":         time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "completed_at":       time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "connection_method":  connection_method,

        # Battery
        "battery_health_pct":       wear_pct,
        "design_capacity_mah":      capacity["design_mah"],
        "estimated_capacity_mah":   capacity["estimated_mah"],
        "battery_level_pct":        battery["level"],
        "battery_temp_celsius":     battery["temperature_celsius"],
        "battery_voltage_mv":       battery["voltage_mv"],

        # Classification
        "severity":    severity,
        "root_cause":  root_cause,

        # Offenders
        "wakelock_top5": wl_top5,
        "cpu_top5":      cpu_top5,

        # Legacy aliases for existing UI components
        "offending_package": offending_pkg,
        "wakelock_offender": len(wl_top5) > 0,
        "cpu_offender":      top_cpu_pct > 15,

        # Events
        "crash_count_24h": crashes,
        "thermal_events":  thermal_events,
        
        # New Diagnostics
        "memory_free_pct": memory["free_pct"],
        "storage_utilization_pct": storage["utilization_pct"],

        # Diagnosis
        "diagnosis_summary":  diagnosis_summary,
        "recommended_action": action,
        "action_label":       action_label,
        "adb_command":        adb_command,
        "evidence_snippets":  evidence,

        # Metadata
        "payload_size": payload_size,
    }

    # ── Persist to DynamoDB ────────────────────────────────────────────────────
    try:
        put_job(
            job_id=job_id,
            status="COMPLETE",
            device_id=device_id,
            connection_method=connection_method,
            created_at=now,
            ttl=now + (7 * 24 * 3600),
            report=json.dumps(report),
        )
        print(f"[analyze] Job {job_id} saved. severity={severity}, root_cause={root_cause}")
    except Exception as exc:
        # Don't fail the request if DynamoDB is unavailable — still return the report
        print(f"[analyze] DynamoDB write failed (non-fatal): {exc}")

    return {
        "statusCode": 200,
        "headers": _cors(),
        "body": json.dumps(report),
    }
