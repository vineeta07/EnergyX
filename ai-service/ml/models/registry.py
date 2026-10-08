"""File-based model registry (versioned artifacts + metadata + 'current' pointer).
Mirrors the SageMaker Model Registry layout so artifacts can be synced to
s3://<bucket>/ml/models/<key>/<version>/ unchanged."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import joblib

from app.config import ARTIFACT_DIR

_lock = threading.Lock()
_loaded: dict[str, dict] = {}


def _dir(key: str) -> Path:
    return ARTIFACT_DIR / key


def next_version(key: str) -> str:
    d = _dir(key)
    n = len([p for p in d.glob("v*") if p.is_dir()]) + 1 if d.exists() else 1
    return f"v{n}.{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"


def save(key: str, version: str, model_obj: dict, meta: dict) -> str:
    d = _dir(key) / version
    d.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_obj, d / "model.joblib")
    meta = {**meta, "version": version, "model_key": key, "saved_at": datetime.now(timezone.utc).isoformat()}
    (d / "metadata.json").write_text(json.dumps(meta, indent=2, default=str))
    (_dir(key) / "current.json").write_text(json.dumps({"version": version}))
    with _lock:
        _loaded[key] = {"version": version, "model": model_obj, "meta": meta}
    return str(d)


def load(key: str) -> dict | None:
    with _lock:
        if key in _loaded:
            return _loaded[key]
    ptr = _dir(key) / "current.json"
    if not ptr.exists():
        return None
    version = json.loads(ptr.read_text())["version"]
    d = _dir(key) / version
    try:
        entry = {"version": version, "model": joblib.load(d / "model.joblib"), "meta": json.loads((d / "metadata.json").read_text())}
    except Exception:
        return None
    with _lock:
        _loaded[key] = entry
    return entry


def status() -> dict:
    out = {}
    for key in ("forecast", "classifier", "energy"):
        e = load(key)
        out[key] = {"loaded": bool(e), "version": e["version"] if e else None, "algorithm": e["meta"].get("algorithm") if e else None}
    out["ranker"] = {"loaded": True, "version": "utility-v2", "algorithm": "weighted multi-criteria utility + Monte-Carlo stability"}
    out["router"] = {"loaded": True, "version": "ortools-cvrptw", "algorithm": "OR-Tools CVRP w/ time windows (GLS)"}
    return out
