"""File-based model registry (versioned artifacts + metadata + 'current' pointer).
Mirrors the SageMaker Model Registry layout so artifacts can be synced to
s3://<bucket>/ml/models/<key>/<version>/ unchanged."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import joblib

from app.config import ARTIFACT_DIR, S3_BUCKET

S3_PREFIX = "ml/models"


def _s3():
    import boto3  # credentials from the standard AWS chain (env, profile, SSO, ECS task role)
    return boto3.client("s3")


def remote_info() -> dict:
    return {"store": "s3" if S3_BUCKET else "local", "bucket": S3_BUCKET or None, "prefix": S3_PREFIX if S3_BUCKET else None}


def _push(key: str, version: str):
    """Mirror a saved version + the current pointer to S3 (best effort; never breaks training)."""
    if not S3_BUCKET:
        return
    try:
        c = _s3()
        for f in ("model.joblib", "metadata.json"):
            c.upload_file(str(_dir(key) / version / f), S3_BUCKET, f"{S3_PREFIX}/{key}/{version}/{f}")
        c.upload_file(str(_dir(key) / "current.json"), S3_BUCKET, f"{S3_PREFIX}/{key}/current.json")
    except Exception as e:
        print(f"[registry] S3 upload failed for {key} {version}: {type(e).__name__}: {e}")


def _pull(key: str) -> bool:
    """Fetch the current version of a model from S3 when it is not on local disk (e.g. a fresh container)."""
    if not S3_BUCKET:
        return False
    try:
        c = _s3()
        d = _dir(key)
        d.mkdir(parents=True, exist_ok=True)
        c.download_file(S3_BUCKET, f"{S3_PREFIX}/{key}/current.json", str(d / "current.json"))
        version = json.loads((d / "current.json").read_text())["version"]
        (d / version).mkdir(parents=True, exist_ok=True)
        for f in ("model.joblib", "metadata.json"):
            c.download_file(S3_BUCKET, f"{S3_PREFIX}/{key}/{version}/{f}", str(d / version / f))
        return True
    except Exception as e:
        print(f"[registry] S3 download skipped for {key}: {type(e).__name__}")
        return False

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
    _push(key, version)
    return f"s3://{S3_BUCKET}/{S3_PREFIX}/{key}/{version}/" if S3_BUCKET else str(d)


def load(key: str) -> dict | None:
    with _lock:
        if key in _loaded:
            return _loaded[key]
    ptr = _dir(key) / "current.json"
    if not ptr.exists() and not _pull(key):
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
