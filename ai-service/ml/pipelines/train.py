"""Offline training pipeline.

  raw data (API export) -> snapshot -> validation -> cleaning (missing values,
  outliers) -> feature engineering -> time-based train/val/test split ->
  training -> evaluation (incl. naive baselines) -> versioned artifact ->
  registry 'current' pointer (serving hot-swaps) -> callback to the API
  (model_versions, training_runs, feedback rows marked as consumed).

Run standalone:  python -m ml.pipelines.train --all
In AWS this module is the entrypoint of a SageMaker Training Job triggered by
EventBridge Scheduler (daily) or by the feedback-volume / drift rules.
"""
from __future__ import annotations

import argparse
import threading
import time
import traceback

from ml.data import loader
from ml.models import registry
from ml.training import classifier, energy, forecast

_lock = threading.Lock()
DATASET_FOR = {"forecast": "waste_records", "classifier": "compositions", "energy": "energy"}


def train_one(key: str) -> dict:
    t0 = time.time()
    raw = loader.fetch(DATASET_FOR[key])
    snap = loader.snapshot(DATASET_FOR[key], raw)
    fb_max = loader.feedback_max_id()
    backtest = None
    if key == "forecast":
        obj, meta = forecast.train(raw)
    elif key == "classifier":
        obj, meta = classifier.train(raw)
    else:
        obj, meta, backtest = energy.train(raw)
    version = registry.next_version(key)
    meta["log"]["snapshot"] = snap
    meta["log"]["duration_s"] = round(time.time() - t0, 2)
    uri = registry.save(key, version, obj, meta)
    return {"version": version, "algorithm": meta["algorithm"], "dataset_size": meta["dataset_size"], "metrics": meta["metrics"],
            "params": meta.get("params"), "artifact_uri": uri, "log": meta["log"], "backtest": backtest, "max_feedback_id": fb_max}


def run_jobs(runs: list[dict]):
    """Train sequentially (one job at a time per process) and report each result to the API."""
    with _lock:
        for r in runs:
            try:
                res = train_one(r["model_key"])
                loader.post_callback(r["run_id"], {"status": "completed", **res})
                print(f"[train] {r['model_key']} {res['version']} done: {res['metrics'].get('mape') or res['metrics'].get('f1')}")
            except Exception as e:  # report failure; never crash the server
                traceback.print_exc()
                try:
                    loader.post_callback(r["run_id"], {"status": "failed", "log": {"error": str(e)}})
                except Exception:
                    pass


def start_background(runs: list[dict]):
    threading.Thread(target=run_jobs, args=(runs,), daemon=True).start()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--model", choices=list(DATASET_FOR))
    a = ap.parse_args()
    keys = list(DATASET_FOR) if a.all or not a.model else [a.model]
    for k in keys:
        res = train_one(k)
        print(k, res["version"], {m: v for m, v in res["metrics"].items() if not isinstance(v, dict)})
