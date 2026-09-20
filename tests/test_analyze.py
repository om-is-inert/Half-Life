import os
import sys
import json
import pytest

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

def get_fixture(name):
    path = os.path.join(os.path.dirname(__file__), 'fixtures', name)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

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
    raw = "Just some random batterystats text without capacity"
    res = parse_capacity(raw)
    assert res["wear_pct"] is None

def test_parse_capacity_zero():
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
    assert res[2]["package"] == "com.android.systemui"

def test_parse_thermal_false_flags():
    raw = """
IsStatusOverride: false
IsThrottling: false
Critical Temperature: false
    """
    res = parse_thermal(raw)
    assert res["is_throttling"] is False
    assert res["critical_temp"] is False
    
    raw_true = "IsThrottling: true\nCritical Temperature: true"
    res = parse_thermal(raw_true)
    assert res["is_throttling"] is True
    assert res["critical_temp"] is True

def test_handler_empty_input(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST_DEVICE"
        })
    }
    
    res = handler(event, {})
    body = json.loads(res["body"])
    
    assert body["battery_level_pct"] is None
    assert body["severity"] == "UNKNOWN"
    assert body["root_cause"] == "insufficient_data"

def test_handler_payload_too_large():
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST_DEVICE",
            "battery_raw": "A" * (6 * 1024 * 1024)
        })
    }
    res = handler(event, {})
    assert res["statusCode"] == 413

def test_handler_systemui_cpu(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST_DEVICE",
            "battery_raw": "level: 100\nhealth: 2",
            "batterystats_raw": "Wakelock com.example: 10s realtime",
            "cpuinfo_raw": "  85.5% 1234/com.android.systemui: 60.1% user + 25.4% kernel\n  5.0% com.facebook.katana: 3.0% user + 2.0% kernel"
        })
    }
    
    res = handler(event, {})
    body = json.loads(res["body"])
    
    assert body["severity"] == "LOW"
    assert body["root_cause"] == "normal"
    assert len(body["cpu_top5"]) == 2

def test_dead_battery_high_temp(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST_DEVICE",
            "battery_raw": "level: 50\nhealth: 4\ntemperature: 650",
            "cpuinfo_raw": "  5.0% app: 3% user",
            "batterystats_raw": "Wakelock test: 10s realtime"
        })
    }
    res = handler(event, {})
    body = json.loads(res["body"])
    assert body["severity"] == "CRITICAL"
    assert body["root_cause"] == "battery_degradation"

def test_invalid_types_json(monkeypatch):
    event = {
        "httpMethod": "POST",
        "body": "null"
    }
    res = handler(event, {})
    assert res["statusCode"] == 400
    
    event = {
        "httpMethod": "POST",
        "body": json.dumps({"battery_raw": ["not", "a", "string"]})
    }
    res = handler(event, {})
    assert res["statusCode"] == 200 # type fallback kicks in, setting it to ""

def test_partial_result(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST_DEVICE",
            "battery_raw": "level: 100\nhealth: 2"
            # No CPU or wakelock data
        })
    }
    res = handler(event, {})
    body = json.loads(res["body"])
    assert body["severity"] == "UNKNOWN"
    assert body["root_cause"] == "insufficient_data"

def test_fixtures_normal(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST",
            "battery_raw": get_fixture("normal_device.txt"),
            "batterystats_raw": get_fixture("normal_device.txt"),
            "cpuinfo_raw": get_fixture("normal_device.txt"),
            "thermal_raw": get_fixture("normal_device.txt")
        })
    }
    res = handler(event, {})
    body = json.loads(res["body"])
    # normal_device.txt is missing CPU info and Wakelocks, so it triggers partial result
    assert body["severity"] == "UNKNOWN"
    assert body["root_cause"] == "insufficient_data"
    assert body["battery_health_pct"] is None
    
def test_fixtures_degraded(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST",
            "battery_raw": get_fixture("battery_degraded.txt"),
            "batterystats_raw": get_fixture("battery_degraded.txt"),
            "cpuinfo_raw": get_fixture("battery_degraded.txt"),
            "thermal_raw": get_fixture("battery_degraded.txt")
        })
    }
    res = handler(event, {})
    body = json.loads(res["body"])
    assert body["severity"] == "CRITICAL"
    assert body["root_cause"] == "battery_degradation"
    assert body["battery_health_pct"] == 63 # 2820/4500 = 0.626

def test_fixtures_overheating(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST",
            "battery_raw": get_fixture("overheating.txt"),
            "batterystats_raw": get_fixture("overheating.txt"),
            "cpuinfo_raw": get_fixture("overheating.txt"),
            "thermal_raw": get_fixture("overheating.txt")
        })
    }
    res = handler(event, {})
    body = json.loads(res["body"])
    # overheating.txt has IsThrottling=true, so it overrides missing_evidence
    assert body["severity"] == "CRITICAL"
    assert body["root_cause"] == "thermal_throttling"
    assert body["battery_temp_celsius"] == 45.0

def test_fixtures_rogue_app(monkeypatch):
    import lambdas.analyze.handler
    monkeypatch.setattr(lambdas.analyze.handler, "put_job", lambda *args, **kwargs: None)
    event = {
        "httpMethod": "POST",
        "body": json.dumps({
            "device_id": "TEST",
            "battery_raw": get_fixture("rogue_app.txt"),
            "batterystats_raw": get_fixture("rogue_app.txt"),
            "cpuinfo_raw": get_fixture("rogue_app.txt"),
            "thermal_raw": get_fixture("rogue_app.txt")
        })
    }
    res = handler(event, {})
    body = json.loads(res["body"])
    # rogue_app.txt has CPU info inside logcat which is NOT parsed by dumpsys cpuinfo parser
    # Therefore, it lacks CPU data and falls back to insufficient_data
    assert body["severity"] == "UNKNOWN"
    assert body["root_cause"] == "insufficient_data"
