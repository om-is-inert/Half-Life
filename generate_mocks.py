import json
import os
import sys

sys.path.insert(0, os.path.abspath('lambdas/analyze'))
from handler import (
    parse_battery, parse_capacity, parse_wakelocks, parse_cpu,
    parse_thermal, parse_crashes, parse_memory, parse_storage,
    classify, build_summary, ACTION_MAP
)

def build_mock(fixture_name, job_id):
    raw = open(f'tests/fixtures/{fixture_name}').read()
    battery  = parse_battery(raw)
    capacity = parse_capacity(raw)
    wl_top5  = parse_wakelocks(raw)
    cpu_top5 = parse_cpu(raw)
    thermal_events = parse_thermal(raw)
    crashes = parse_crashes(raw)
    memory = parse_memory(raw)
    storage = parse_storage(raw)
    
    wear_pct = capacity['wear_pct']
    
    top_cpu_pct = 0
    top_package = None
    for c in cpu_top5:
        if c['package'] not in ('system_server', 'android', 'TOTAL') and not c['package'].startswith('com.android.'):
            if c['total_pct'] > top_cpu_pct:
                top_cpu_pct = c['total_pct']
                top_package = c['package']
                break
                
    classification = classify(
        wear_pct, top_cpu_pct, thermal_events, battery.get('level'),
        len(cpu_top5)>0, len(wl_top5)>0, crashes,
        memory['free_pct'], storage['utilization_pct']
    )
    
    root_cause = classification['root_cause']
    severity = classification['severity']
    action, action_label = ACTION_MAP.get(root_cause, ('none', 'No action'))
    
    evidence = []
    if capacity['estimated_mah']: evidence.append(f"Estimated: {capacity['estimated_mah']} mAh / Design: {capacity['design_mah']} mAh")
    if cpu_top5: evidence.append(f"{cpu_top5[0]['total_pct']}% {cpu_top5[0]['package']}")
    if wl_top5: evidence.append(f"Wakelock {wl_top5[0]['package']}")
    
    return {
        'jobId': job_id,
        'device_id': f'DEMO_{fixture_name}',
        'created_at': '2026-09-20T17:00:00Z',
        'completed_at': '2026-09-20T17:00:00Z',
        'connection_method': 'demo',
        'battery_health_pct': wear_pct,
        'severity': severity,
        'root_cause': root_cause,
        'offending_package': top_package if root_cause in ('rogue_process', 'thermal_throttling') else None,
        'wakelock_offender': len(wl_top5) > 0,
        'cpu_offender': top_cpu_pct > 15,
        'crash_count_24h': crashes,
        'thermal_events': thermal_events,
        'memory_free_pct': memory['free_pct'] if memory['free_pct'] is not None else 45, # mock fallback
        'storage_utilization_pct': storage['utilization_pct'] if storage['utilization_pct'] is not None else 65, # mock fallback
        'diagnosis_summary': build_summary(root_cause, severity, wear_pct, top_package, top_cpu_pct, thermal_events, capacity['design_mah'], capacity['estimated_mah']),
        'recommended_action': action,
        'action_label': action_label,
        'adb_command': None,
        'evidence_snippets': evidence
    }

mocks = {
    '2ab005f0-5087-4943-ab3b-9ca2e22d4d2b': build_mock('normal_device.txt', '2ab005f0-5087-4943-ab3b-9ca2e22d4d2b'),
    '2351a976-c1ed-4480-bd74-da701f556cd9': build_mock('rogue_app.txt', '2351a976-c1ed-4480-bd74-da701f556cd9'),
    'b4d66801-65b1-4ec6-8cd1-7a195ab44de1': build_mock('overheating.txt', 'b4d66801-65b1-4ec6-8cd1-7a195ab44de1'),
    '43d7f85c-1557-4693-87be-da406f54644e': build_mock('battery_degraded.txt', '43d7f85c-1557-4693-87be-da406f54644e')
}

with open('dashboard/src/config/demo_mocks.ts', 'w', encoding='utf-8') as f:
    f.write('import type { DiagnosisReport } from "../types/dashboard";\n\n')
    f.write('export const DEMO_MOCKS: Record<string, DiagnosisReport> = ')
    f.write(json.dumps(mocks, indent=2))
    f.write(';\n')

print('Mock generated successfully!')
