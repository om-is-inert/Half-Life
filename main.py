import os
import subprocess
import json
import urllib.request
import urllib.error
import sys

API_URL = os.environ.get("HALF_LIFE_API_URL", "https://j1bqi05936.execute-api.us-east-1.amazonaws.com/prod/analyze")

def run_adb(command):
    try:
        result = subprocess.run(["adb", "shell"] + command, capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error running adb {' '.join(command)}: {e}")
        return ""
    except FileNotFoundError:
        print("Error: adb is not installed or not in your PATH.")
        sys.exit(1)

def main():
    print("Checking for connected Android devices...")
    try:
        devices_out = subprocess.run(["adb", "devices"], capture_output=True, text=True, check=True).stdout
        if "device" not in devices_out.split("\n")[1]:
            print("No device detected. Please connect an Android device and enable USB Debugging.")
            sys.exit(1)
    except FileNotFoundError:
        print("Error: adb is not installed or not in your PATH.")
        sys.exit(1)

    device_id_out = run_adb(["getprop", "ro.serialno"]).strip()
    device_id = device_id_out if device_id_out else "unknown_device"
    
    print(f"Device connected: {device_id}")
    print("Extracting diagnostics... (this may take a few seconds)")

    battery_raw = run_adb(["dumpsys", "battery"])
    batterystats_raw = run_adb(["dumpsys", "batterystats", "|", "head", "-n", "300"])
    cpuinfo_raw = run_adb(["dumpsys", "cpuinfo", "|", "head", "-n", "80"])
    thermal_raw = run_adb(["dumpsys", "thermal_service", "|", "head", "-n", "60"])
    
    # New Diagnostics for exhaustive coverage
    dropbox_raw = run_adb(["dumpsys", "dropbox", "--print", "|", "tail", "-n", "2000"])
    meminfo_raw = run_adb(["dumpsys", "meminfo"])
    storage_raw = run_adb(["dumpsys", "diskstats"])

    payload = {
        "device_id": device_id,
        "connection_method": "python_cli",
        "battery_raw": battery_raw,
        "batterystats_raw": batterystats_raw,
        "cpuinfo_raw": cpuinfo_raw,
        "thermal_raw": thermal_raw,
        "dropbox_raw": dropbox_raw,
        "meminfo_raw": meminfo_raw,
        "storage_raw": storage_raw
    }

    print("Uploading diagnostics to Half-Life AI...")
    
    req = urllib.request.Request(API_URL, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            print("\n" + "="*50)
            print("DIAGNOSIS COMPLETE")
            print("="*50)
            print(f"Severity:   {res.get('severity', 'UNKNOWN')}")
            print(f"Root Cause: {res.get('root_cause', 'UNKNOWN')}")
            print(f"Job ID:     {res.get('jobId', 'UNKNOWN')}")
            print("\nPaste the Job ID in your Half-Life Dashboard to view the full report!")
            
    except urllib.error.URLError as e:
        print(f"Error connecting to backend API: {e}")
        
if __name__ == "__main__":
    main()
