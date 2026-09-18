"""
dashboard/app.py — Half-Life local web dashboard (Flask).

Routes:
  GET  /               → Upload form + job ID lookup
  GET  /status/<jobId> → Poll and render diagnosis result
  POST /run-adb        → Execute ADB command locally (with user confirmation gate)

Run: python app.py
Then open: http://localhost:5000
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import requests
from flask import Flask, jsonify, redirect, render_template, request, url_for

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_BASE_URL: str = os.environ.get(
    "HALFLIFE_API_URL",
    "https://REPLACE_ME.execute-api.us-east-1.amazonaws.com/prod",
)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "halflife-dev-secret-change-me")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    """Landing page — job ID lookup form."""
    return render_template("index.html", api_url=API_BASE_URL)


@app.route("/status/<job_id>")
def status(job_id: str):
    """
    Render the diagnosis report page for a given job ID.
    The page itself polls via AJAX; this route renders the shell.
    """
    return render_template("index.html", job_id=job_id, api_url=API_BASE_URL)


@app.route("/api/poll/<job_id>")
def api_poll(job_id: str):
    """
    Proxy to API Gateway /report/{jobId}.
    Avoids CORS issues when running dashboard locally against a deployed API.
    """
    try:
        resp = requests.get(
            f"{API_BASE_URL.rstrip('/')}/report/{job_id}",
            timeout=10,
        )
        return jsonify(resp.json()), resp.status_code
    except requests.RequestException as exc:
        return jsonify({"error": str(exc), "status": "ERROR"}), 502


@app.route("/api/run-adb", methods=["POST"])
def run_adb():
    """
    Execute an ADB command locally. Only safe adb shell commands are permitted.
    The UI must send a confirmation token to prevent accidental execution.
    """
    data = request.get_json(force=True)
    command: str = data.get("command", "").strip()
    confirmed: bool = data.get("confirmed", False)

    if not confirmed:
        return jsonify({"error": "Confirmation required"}), 400

    # Allowlist: only permit adb shell commands that match safe patterns
    safe_prefixes = (
        "adb shell am force-stop ",
        "adb shell pm disable-user ",
        "adb shell pm clear ",
        "adb shell am broadcast ",
        "adb shell settings get ",
        "adb shell dumpsys battery",
    )
    if not any(command.startswith(p) for p in safe_prefixes):
        return jsonify({"error": "Command not in allowlist"}), 403

    try:
        result = subprocess.run(
            command.split(),
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        return jsonify({
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "ADB command timed out"}), 504
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    print(f"\n  Half-Life Dashboard running at http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
