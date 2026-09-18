# ⚡ Half-Life — AI-Powered Android Hardware Triage

> Turn raw Android system logs into plain-English hardware/software diagnoses using AWS Bedrock (Claude 3.5 Sonnet).

---

## Architecture

```
[Android Phone] --USB/ADB--> [local-client/main.py]
        │
        │  1. adb bugreport / logcat / dumpsys
        │  2. PII scrub (IMEI, phone, email, MAC, IP)
        │  3. POST /get-upload-url → presigned S3 URL
        │  4. PUT scrubbed log → S3
        ▼
   [S3: half-life-raw-logs-{AccountId}]
        │
        │  S3 ObjectCreated trigger
        ▼
   [Lambda: Preprocessor]  strip noise, extract sections, chunk
        │
        │  Async invoke
        ▼
   [Lambda: BedrockInvoke]  Claude 3.5 Sonnet → structured JSON
        │
        │  Async invoke
        ▼
   [Lambda: Formatter]  ADB command mapping, severity classification
        │
        ▼
   [DynamoDB: HalfLifeJobs]  store report + status
        │
        ▼
   [API Gateway]  GET /report/{jobId}
        │
        ▼
   [local-client/poll.py]  CLI report  OR  [dashboard/app.py]  Web UI
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.10+ | Local client + Lambda functions |
| AWS CLI v2 | Latest | Deploy + config |
| AWS SAM CLI | Latest | IaC deploy |
| ADB | Platform tools | Android log capture |
| Git | Any | Version control |
| Node.js | Optional | Not required (no frontend build step) |

### AWS Services Required
- S3, Lambda, API Gateway, DynamoDB, Bedrock, IAM, CloudWatch

### Bedrock Model Access
> ⚠️ **Manual step required**: Before deploying, go to the [Bedrock Console](https://console.aws.amazon.com/bedrock/home#/modelaccess) → Model access → Request access for **Claude 3.5 Sonnet** in `us-east-1`.

---

## Setup

### 1. Configure AWS credentials
```bash
aws configure
# Enter: AWS Access Key ID, Secret Access Key, Region (us-east-1), Output (json)
```

### 2. Install local client dependencies
```bash
cd local-client
pip install -r requirements.txt
```

### 3. Deploy the cloud stack
```bash
cd infra
sam build
sam deploy --guided   # first time only — fills samconfig.toml
# Subsequent deploys:
sam deploy
```

After deploy, copy the **ApiBaseUrl** from the CloudFormation outputs and set it:
```bash
# Windows
setx HALFLIFE_API_URL "https://XXXX.execute-api.us-east-1.amazonaws.com/prod"

# Or set it inline when running
set HALFLIFE_API_URL=https://XXXX.execute-api.us-east-1.amazonaws.com/prod
```

---

## Running the Local Client

### Enable USB debugging on your Android device
Settings → Developer Options → USB Debugging → On

### Connect your device and run
```bash
cd local-client
python main.py
```

### Options
```
python main.py --help

  --device   <serial>   ADB device serial (auto if one device)
  --duration <seconds>  Logcat capture time (default: 60)
  --bugreport           Also run adb bugreport (slow, optional)
  --api-url  <url>      Override API Gateway URL
  --no-scrub            Skip PII scrubbing (not recommended)
  --skip-capture <path> Use an existing log file
```

### Example
```bash
# Quick run (60s capture, auto-detect device)
python main.py

# Extended run with bugreport
python main.py --duration 120 --bugreport

# Use an existing log file (skips ADB capture)
python main.py --skip-capture logs/my_device_log.txt
```

---

## Web Dashboard

```bash
cd dashboard
pip install -r requirements.txt
python app.py
```
Open: **http://localhost:5000**

Paste your Job ID to see:
- 🔋 Battery health gauge
- 🎯 Severity badge (LOW / MEDIUM / HIGH / CRITICAL)
- 📦 Offending package + crash/thermal counters
- 💬 AI diagnosis summary
- ⚡ One-click "Fix It" ADB command runner (with confirmation)
- 📜 Evidence log snippets

---

## Running Tests

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## Repo Structure

```
Half-Life/
├── local-client/
│   ├── main.py          # Entry point — orchestrates capture→scrub→upload→poll
│   ├── capture.py       # ADB log extraction (dumpsys, logcat)
│   ├── scrub.py         # PII scrubbing (IMEI, email, MAC, phone, IP)
│   ├── upload.py        # Presigned URL + S3 upload
│   ├── poll.py          # API polling + Rich terminal renderer
│   └── requirements.txt
├── lambdas/
│   ├── shared/
│   │   └── utils.py         # DynamoDB helpers, JSON validation, chunker
│   ├── get_upload_url/
│   │   └── handler.py       # POST /get-upload-url
│   ├── preprocessor/
│   │   └── handler.py       # S3 trigger → clean + chunk log
│   ├── bedrock_invoke/
│   │   └── handler.py       # Claude via Bedrock, retry, multi-chunk synthesis
│   ├── formatter/
│   │   └── handler.py       # JSON → human report, ADB command mapping
│   └── get_report/
│       └── handler.py       # GET /report/{jobId}
├── prompts/
│   └── system_prompt.md     # Claude system prompt (Android engineer persona)
├── infra/
│   ├── template.yaml        # SAM template (S3, DDB, Lambda, APIGW, CloudWatch)
│   └── samconfig.toml       # SAM deploy config
├── dashboard/
│   ├── app.py               # Flask web server
│   ├── templates/
│   │   └── index.html       # Dark glassmorphism UI
│   ├── static/
│   │   └── style.css        # Design system
│   └── requirements.txt
├── tests/
│   ├── fixtures/
│   │   ├── normal_device.txt
│   │   ├── battery_degraded.txt
│   │   ├── rogue_app.txt
│   │   └── overheating.txt
│   ├── test_preprocessor.py
│   └── test_scrub.py
└── README.md
```

---

## Diagnosis JSON Schema

```json
{
  "battery_health_pct": 88,
  "root_cause": "rogue_process",
  "offending_package": "com.facebook.katana",
  "crash_count_24h": 412,
  "thermal_events": 3,
  "wakelock_offender": "com.facebook.katana/.ForegroundService",
  "cpu_offender": "com.facebook.katana",
  "diagnosis_summary": "Your device is being drained by Facebook, which has crashed 412 times in the last 24 hours and holds a 14-hour wakelock preventing your phone from sleeping.",
  "recommended_action": "disable_package",
  "adb_command": "adb shell pm disable-user --user 0 com.facebook.katana",
  "confidence": 0.94,
  "evidence_snippets": [
    "FATAL EXCEPTION: main — Process: com.facebook.katana, PID: 9821",
    "Wakelock com.facebook.katana/.ForegroundService: 14h 22m 03s realtime",
    "38% com.facebook.katana: 29% user + 9% kernel"
  ]
}
```

---

## Security Notes

- **Least-privilege IAM**: Each Lambda has only the permissions it needs.
- **PII Scrubbing**: IMEI, IMSI, phone numbers, email, MAC addresses, private IPs, and account names are stripped before upload.
- **S3 Lifecycle**: Raw logs auto-delete after 7 days.
- **API Throttling**: API Gateway is rate-limited (10 RPS / 20 burst).
- **ADB Allowlist**: The dashboard's "Fix It" button uses an allowlist of safe `adb shell` prefixes.
- **TLS Only**: S3 bucket policy denies all non-HTTPS requests.

---

## Cost Estimate (prototype/demo scale)

| Service | Estimated Cost |
|---------|---------------|
| Bedrock (Claude 3.5 Sonnet) | ~$0.01–$0.05 per diagnosis |
| Lambda | Within free tier for <100 diagnoses/month |
| S3 | Within free tier (~50 MB/log × 7-day lifecycle) |
| DynamoDB | Within free tier (PAY_PER_REQUEST + TTL) |
| API Gateway | Within free tier |

> ⚠️ Bedrock is the primary cost driver. A preprocessed 600K-char log ≈ ~150K tokens input ≈ ~$0.45 per run at Sonnet pricing. Preprocessing/chunking is essential to keep this low.

---

## Stretch Goals

- [ ] Malware detection (excessive network calls in logs)
- [ ] Historical trend view (battery health decline over time, per device)
- [ ] Auto-remediation mode (user-consented ADB fix without manual confirmation)
- [ ] WebSocket push (replace polling with real-time delivery)
- [ ] Cognito auth (multi-user dashboard with device history)
- [ ] Fine-tuned prompt variants per Android version / OEM skin
