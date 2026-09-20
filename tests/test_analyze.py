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
  level: 20
  health: 2
    """
    res = parse_battery(raw)
    assert res["level"] == 20
    assert res["health_label"] == "Good"
    
def test_parse_battery_explicit_flags():
    raw_overheat = "health: 3\nlevel: 50"
    raw_dead = "health: 4\nlevel: 0"
    
    assert parse_battery(raw_overheat)["health_label"] == "Overheat"
    assert parse_battery(raw_dead)["health_label"] == "Dead"

def test_parse_capacity_missing():
    # Missing capacity should return wear_pct = None, not substitute level
    raw = "Just some random batterystats text without capacity"
    res = parse_capacity(raw)
    assert res["wear_pct"] is None

def test_parse_capacity_zero():
    # Division by zero prevention
    raw = "Estimated battery capacity: 3100 mAh\nDesign battery capacity: 0 mAh"
    res = parse_capacity(raw)
    assert res["wear_pct"] is None

def test_parse_cpu_decimal_and_system():
    raw = """
  67.5% 1234/com.example.app: 60.1% user + 7.4% kernel
  38% com.facebook.katana: 29% user + 9% kernel
  2.4% com.android.systemui: 1.8% user + 0.6% kernel
    """
    res = parse_cpu(raw)
    assert len(res) == 3
    
    assert res[0]["package"] == "com.example.app"
    assert res[0]["total_pct"] == 67.5
    
    assert res[1]["package"] == "com.facebook.katana"
    assert res[1]["total_pct"] == 38.0
    
    assert res[2]["package"] == "com.android.systemui"
    assert res[2]["total_pct"] == 2.4

def test_parse_thermal_false_flags():
    raw = """
IsStatusOverride: false
IsThrottling: false
Critical Temperature: false
    """
    assert parse_thermal(raw) == 0
    
    raw_true = "IsThrottling: true\nCritical Temperature: true"
    assert parse_thermal(raw_true) == 2

def test_handler_empty_input(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST_DEVICE",
            "battery_raw": "",
            "batterystats_raw": "",
            "cpuinfo_raw": "",
            "thermal_raw": ""
        })
    }
    
    res = handler(event, {})
    body = json.loads(res["body"])
    
    assert body["battery_level_pct"] is None
    assert body["battery_health_pct"] is None
    assert body["severity"] == "LOW"
    assert body["root_cause"] == "normal"
    assert body["recommended_action"] == "none"

def test_handler_systemui_cpu(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST_DEVICE",
            "cpuinfo_raw": "  85.5% 1234/com.android.systemui: 60.1% user + 25.4% kernel\n  5.0% com.facebook.katana: 3.0% user + 2.0% kernel"
        })
    }
    
    res = handler(event, {})
    body = json.loads(res["body"])
    
    # Even though systemui is 85.5%, it should not trigger a rogue_process critical severity
    # because it is a system app
    assert body["severity"] == "LOW"
    assert body["root_cause"] == "normal"
    # But it should still show up in the top 5
    assert len(body["cpu_top5"]) == 2
    assert body["cpu_top5"][0]["package"] == "com.android.systemui"
