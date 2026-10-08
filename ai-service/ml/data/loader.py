"""Raw-data ingestion: pulls training tables from the WattCycle API's
service-only dataset endpoints and snapshots them to disk (Parquet-free CSV
so the snapshot is human-inspectable). A snapshot id is recorded with every
model version so each model is traceable to the exact data it saw."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

import httpx
import pandas as pd

from app.config import BACKEND_URL, SERVICE_KEY, SNAPSHOT_DIR

DATASETS = ("waste_records", "compositions", "energy")


def _get(path: str):
    r = httpx.get(f"{BACKEND_URL}{path}", headers={"x-service-key": SERVICE_KEY}, timeout=60)
    r.raise_for_status()
    return r.json()


def fetch(name: str) -> pd.DataFrame:
    if name not in DATASETS:
        raise ValueError(name)
    df = pd.DataFrame(_get(f"/internal/datasets/{name}"))
    return df


def feedback_max_id() -> int:
    return int(_get("/internal/datasets/feedback_max_id")["max_id"])


def snapshot(name: str, df: pd.DataFrame) -> str:
    """Persist the raw pull; returns a content hash used as snapshot id."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    payload = df.to_csv(index=False)
    digest = hashlib.sha256(payload.encode()).hexdigest()[:12]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = SNAPSHOT_DIR / f"{name}-{stamp}-{digest}.csv"
    path.write_text(payload, encoding="utf8")
    # keep the 5 most recent per dataset
    old = sorted(SNAPSHOT_DIR.glob(f"{name}-*.csv"))[:-5]
    for p in old:
        p.unlink(missing_ok=True)
    (SNAPSHOT_DIR / f"{name}-latest.json").write_text(json.dumps({"file": path.name, "rows": len(df), "sha": digest}))
    return digest


def post_callback(run_id: int, body: dict):
    r = httpx.post(f"{BACKEND_URL}/internal/training-runs/{run_id}/complete", headers={"x-service-key": SERVICE_KEY}, json=body, timeout=120)
    r.raise_for_status()
