# ⚡ Half-Life — AI-Powered Android Hardware Triage

> Turn raw Android system logs into plain-English hardware/software diagnoses using a deterministic analysis engine and WebUSB.

---

## Architecture

```
[Android Phone] -- WebUSB --> [Browser (React/Vite)]
                                    │
                                    │  1. Extract logs via dumpsys
                                    │  2. Client-side pre-parsing
                                    │  3. POST /analyze (JSON payload)
                                    ▼
                          [API Gateway]
                                    │
                                    ▼
                 [Lambda: Analyze (Deterministic Parser)]
                     (Evaluates rules in < 100ms)
                                    │
                                    ▼
                    [DynamoDB: HalfLifeJobs]
                                    │
                                    ▼
                     [Browser (Dashboard UI)]
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Frontend dashboard (React/Vite) |
| Python | 3.12+ | Backend Lambdas |
| AWS CLI v2 | Latest | Deploy + config |
| AWS SAM CLI | Latest | IaC deploy |
| Chromium Browser | Latest | Chrome/Edge required for WebUSB |

### AWS Services Required
- Lambda, API Gateway, DynamoDB, IAM, CloudWatch

---

## Setup

### 1. Configure AWS credentials
```bash
aws configure
# Enter: AWS Access Key ID, Secret Access Key, Region (us-east-1), Output (json)
```

### 2. Deploy the cloud stack
```bash
cd infra
sam build
sam deploy --guided   # first time only — fills samconfig.toml
# Subsequent deploys:
sam deploy
```

After deploy, copy the **ApiBaseUrl** from the CloudFormation outputs.

### 3. Start the Web Dashboard
```bash
cd dashboard
npm install
# Set the API URL for the dashboard
export VITE_API_URL="https://XXXX.execute-api.us-east-1.amazonaws.com/prod"
npm run dev
```

Open: **http://localhost:5174** (or whatever port Vite gives you)

---

## Usage (Zero-Install Triage)

1. **Enable USB debugging** on your Android device (Settings → Developer Options → USB Debugging → On).
2. Connect your device via USB to your computer.
3. Open the dashboard in **Chrome** or **Edge**.
4. Click **Connect Android Phone**.
5. Select your phone from the browser prompt.
6. The dashboard will instantly extract logs, analyze them, and present a diagnosis in seconds.

### Fallback Modes
- **Paste Mode**: For browsers without WebUSB (Safari/Firefox), you can manually run ADB commands and paste the output.
- **Job ID**: Retrieve a past diagnosis by entering its Job ID.

---

## Features

- 🔋 **Exact Capacity Measurement**: Compares `estimated_mah` vs `design_mah` for exact wear percentages.
- 🎯 **Deterministic Severity**: Strict threshold-based severity (LOW / MEDIUM / HIGH / CRITICAL).
- 📦 **Wakelock & CPU Rankings**: Identifies rogue processes holding wakelocks or monopolizing CPU cycles.
- 💬 **Plain-English Diagnosis**: Template-generated summaries with zero LLM hallucination risk.
- ⚡ **One-click "Fix It"**: Generates safe, copyable `adb` commands to disable rogue apps or clear caches.

---

## Running Tests

The backend includes a `pytest` suite for the deterministic parsing engine.

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## Repo Structure

```
Half-Life/
├── dashboard/               # React / Vite Web App
│   ├── src/
│   │   ├── components/      # UI Components (DeviceConnector, MetricCards, etc.)
│   │   ├── hooks/           # useAnalysis (WebUSB, Paste, Job Polling flows)
│   │   ├── lib/             # webadb.ts (WebUSB bridge), parser.ts (Client pre-parser)
│   │   └── types/           # TS Interfaces for DiagnosisReport
│   └── package.json
├── lambdas/
│   ├── shared/              # DynamoDB helpers, utils
│   ├── analyze/             # Deterministic log parser and classification (<100ms)
│   └── get_report/          # Fetch stored diagnosis by Job ID
├── infra/
│   ├── template.yaml        # SAM template (2 Lambdas, API Gateway, DynamoDB)
│   └── samconfig.toml       # SAM deploy config
├── tests/
│   ├── fixtures/            # Raw dumpsys Android logs for testing
│   └── test_analyze.py      # Unit tests for the deterministic parser
├── amplify.yml              # Build spec for AWS Amplify Hosting
└── README.md
```

---

## Diagnosis JSON Schema

```json
{
  "jobId": "a3f7c291-84bc-4e2d-9f01-b2d84c3e7a12",
  "device_id": "ZY22ABCD",
  "created_at": "2026-09-19T18:00:00Z",
  "completed_at": "2026-09-19T18:00:00Z",
  "connection_method": "webusb",
  "battery_health_pct": 78,
  "design_capacity_mah": 4000,
  "estimated_capacity_mah": 3100,
  "battery_level_pct": 82,
  "severity": "HIGH",
  "root_cause": "battery_degradation",
  "wakelock_top5": [
    {
      "package": "com.facebook.katana/.ForegroundService",
      "duration_ms": 52323000,
      "duration_label": "14h 32m"
    }
  ],
  "cpu_top5": [
    {
      "package": "com.facebook.katana",
      "total_pct": 38,
      "user_pct": 29,
      "kernel_pct": 9
    }
  ],
  "diagnosis_summary": "Your battery has degraded to approximately 78% of its original capacity (3100 mAh vs. the factory design of 4000 mAh).",
  "recommended_action": "replace_battery",
  "action_label": "Replace the battery — hardware service required",
  "evidence_snippets": [
    "Estimated battery capacity: 3100 mAh / Design: 4000 mAh"
  ]
}
```

---

## Cost Estimate

By migrating from a GenAI model (Claude 3.5 Sonnet) to a deterministic parsing engine, the AWS cost per diagnosis has been dramatically reduced.

| Component | Architecture v1 (Bedrock) | Architecture v2 (Lambda) |
|-----------|-------------------------|------------------------|
| **Cost Per Run** | ~$0.45 per diagnosis (LLM input tokens) | **~$0.00001 per diagnosis** (Lambda execution) |
| **Speed** | 20–30 seconds | **< 100 milliseconds** |

For 1,000 daily diagnoses:
- **Old Cost**: ~$450 / day
- **New Cost**: Basically free (well within AWS Free Tier for Lambda + DynamoDB).
