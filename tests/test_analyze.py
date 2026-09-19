import os
import sys
import json
import pytest

# Ensure lambdas is in path for testing
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from lambdas.analyze.handler import (
    parse_battery,
    parse_capacity,
    parse_wakelocks,
    parse_cpu,
    parse_thermal,
    classify,
    handler
)

def test_parse_battery():
    raw = """
Current Battery Service state:
  AC powered: false
  USB powered: true
  status: 2
  health: 2
  present: true
  level: 82
  scale: 100
  voltage: 4181
  temperature: 285
  technology: Li-ion
    """
    res = parse_battery(raw)
    assert res["level"] == 82
    assert res["voltage_mv"] == 4181
    assert res["temperature_celsius"] == 28.5
    assert res["health_code"] == 2
    assert res["health_label"] == "Good"


def test_parse_capacity():
    raw = """
Estimated battery capacity: 3100 mAh
Min learned battery capacity: 3100 mAh
Max learned battery capacity: 3100 mAh
Design battery capacity: 4000 mAh
    """
    res = parse_capacity(raw)
    assert res["estimated_mah"] == 3100
    assert res["design_mah"] == 4000
    assert res["wear_pct"] == 78


def test_parse_wakelocks():
    raw = """
  Wakelock com.facebook.katana/.ForegroundService: 14h 32m 3s realtime
  Wakelock com.google.android.gms: 2h 5m 1s realtime
  Wakelock com.android.systemui: 5s realtime
    """
    res = parse_wakelocks(raw)
    assert len(res) == 3
    assert res[0]["package"] == "com.facebook.katana/.ForegroundService"
    assert res[0]["duration_ms"] == ((14 * 3600) + (32 * 60) + 3) * 1000
    
    assert res[1]["package"] == "com.google.android.gms"
    assert res[1]["duration_ms"] == ((2 * 3600) + (5 * 60) + 1) * 1000


def test_parse_cpu():
    raw = """
Load: 4.88 / 4.96 / 4.93
CPU usage from 182741ms to 109280ms ago (2024-03-24 10:11:22 to 2024-03-24 10:12:35):
  38% com.facebook.katana: 29% user + 9% kernel / faults: 18451 minor 8 major
  12% system_server: 7% user + 5% kernel / faults: 8451 minor 1 major
  2.4% com.android.systemui: 1.8% user + 0.6% kernel
  0% TOTAL: 0% user + 0% kernel + 0% iowait + 0% irq + 0% softirq
    """
    res = parse_cpu(raw)
    assert len(res) == 2
    assert res[0]["package"] == "com.facebook.katana"
    assert res[0]["total_pct"] == 38
    assert res[0]["user_pct"] == 29
    assert res[0]["kernel_pct"] == 9
    
    assert res[1]["package"] == "system_server"
    assert res[1]["total_pct"] == 12


def test_parse_thermal():
    raw = """
IsStatusOverride: false
Thermal HAL 2.0 interface is initialized
Current temperatures from HAL:
  Temperature{mValue=38.5, mType=0, mName=skin, mStatus=0}
  Temperature{mValue=42.1, mType=3, mName=battery, mStatus=1}
IsThrottling: true
Critical Temperature: false
    """
    res = parse_thermal(raw)
    assert res == 2  # Matches "IsThrottling: true" and "Critical Temperature"


def test_classify():
    # Battery degraded
    c = classify(wear_pct=58, top_cpu_pct=5, thermal_events=0)
    assert c["severity"] == "CRITICAL"
    assert c["root_cause"] == "battery_degradation"
    
    c = classify(wear_pct=70, top_cpu_pct=5, thermal_events=0)
    assert c["severity"] == "HIGH"
    assert c["root_cause"] == "battery_degradation"
    
    # Rogue process
    c = classify(wear_pct=95, top_cpu_pct=60, thermal_events=0)
    assert c["severity"] == "CRITICAL"
    assert c["root_cause"] == "rogue_process"
    
    c = classify(wear_pct=95, top_cpu_pct=35, thermal_events=0)
    assert c["severity"] == "HIGH"
    assert c["root_cause"] == "rogue_process"
    
    # Thermal
    c = classify(wear_pct=95, top_cpu_pct=5, thermal_events=6)
    assert c["severity"] == "CRITICAL"
    assert c["root_cause"] == "thermal_throttling"
    
    # Healthy
    c = classify(wear_pct=95, top_cpu_pct=5, thermal_events=0)
    assert c["severity"] == "LOW"
    assert c["root_cause"] == "normal"


def test_handler(monkeypatch):
    # Mock DynamoDB put_job to avoid AWS calls during tests
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    
    payload = {
        "device_id": "TEST_DEVICE",
        "battery_raw": "level: 82\nhealth: 2",
        "batterystats_raw": "Estimated battery capacity: 3100 mAh\nDesign battery capacity: 4000 mAh\nWakelock com.test.app: 2h 0m 0s realtime",
        "cpuinfo_raw": "  45% com.test.app: 40% user + 5% kernel",
        "thermal_raw": "IsThrottling: true",
        "connection_method": "webusb"
    }
    
    event = {
        "httpMethod": "POST",
        "body": json.dumps(payload)
    }
    
    res = handler(event, {})
    assert res["statusCode"] == 200
    
    body = json.loads(res["body"])
    assert body["device_id"] == "TEST_DEVICE"
    assert body["connection_method"] == "webusb"
    
    # Battery
    assert body["battery_health_pct"] == 78  # 3100 / 4000
    assert body["battery_level_pct"] == 82
    
    # Classify
    assert body["severity"] == "HIGH"
    assert body["root_cause"] == "battery_degradation"
    
    # Offenders
    assert body["cpu_offender"] is True
    assert body["wakelock_offender"] is True
    assert body["cpu_top5"][0]["package"] == "com.test.app"
    assert body["wakelock_top5"][0]["package"] == "com.test.app"
    
    # Action
    assert body["recommended_action"] == "replace_battery"
    assert body["adb_command"] is None
