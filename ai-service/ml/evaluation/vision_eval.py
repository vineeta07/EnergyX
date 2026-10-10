"""Independent real-photo evaluation of the vision classifier at WattCycle stream level.

The model was trained on the Kaggle "Recyclable and Household Waste" photos. To check it
generalises we test on two OTHER real datasets it never saw:
  * TrashNet (garythung/trashnet, MIT)           — cardboard/paper/plastic/metal/glass/trash
  * Waste Classification (bryandts/waste_organic_anorganic_classification) — Organic vs Recyclable

Download once into ml/data/datasets/ (git-ignored):
    trashnet-resized.zip         https://huggingface.co/datasets/garythung/trashnet/resolve/main/dataset-resized.zip
    organic-recyclable.parquet   https://huggingface.co/datasets/bryandts/waste_organic_anorganic_classification
                                 (refs/convert/parquet/default/train/0000.parquet)
A stratified random sample is scored; the report is written to ml/evaluation/reports/.

    python -m ml.evaluation.vision_eval --per-dataset 300
"""
from __future__ import annotations

import argparse
import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from ml.inference import vision

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "evaluation" / "reports"

DATASETS = {
    "trashnet": {
        "id": "garythung/trashnet", "size": 5054,
        # dataset label -> WattCycle stream (None = no counterpart, reported but not scored)
        "map": {"cardboard": "paper", "paper": "paper", "plastic": "plastic", "metal": "metal", "glass": "glass", "trash": None},
    },
    "organic": {
        "id": "bryandts/waste_organic_anorganic_classification", "size": 25077,
        "map": {"O": "organic", "R": "not_organic"},
    },
}


DATA = ROOT / "data" / "datasets"


def fetch_sample(key: str, n: int, seed: int = 7) -> list[tuple[bytes, str]]:
    """Stratified random sample from the locally downloaded real datasets (see DATASETS)."""
    rnd = random.Random(seed)
    if key == "trashnet":
        import zipfile
        z = zipfile.ZipFile(DATA / "trashnet-resized.zip")
        names = [x for x in z.namelist() if x.lower().endswith(".jpg")]
        by = defaultdict(list)
        for x in names:
            by[x.split("/")[-2]].append(x)
        per = max(1, n // len(by))
        return [(z.read(x), lab) for lab, xs in sorted(by.items()) for x in rnd.sample(xs, min(per, len(xs)))]
    import pyarrow.parquet as pq
    t = pq.read_table(DATA / "organic-recyclable.parquet")
    labels = t.column("label").to_pylist()
    names = ["O", "R"]
    by = defaultdict(list)
    for i, l in enumerate(labels):
        by[names[l]].append(i)
    per = n // 2
    idx = [(i, lab) for lab, xs in sorted(by.items()) for i in rnd.sample(xs, per)]
    imgs = t.column("image")
    return [(imgs[i].as_py()["bytes"], lab) for i, lab in idx]


def evaluate(per_dataset: int = 300) -> dict:
    report: dict = {"model": vision.MODEL_ID, "created": time.strftime("%Y-%m-%dT%H:%M:%S"), "datasets": {}}
    for key, ds in DATASETS.items():
        sample = fetch_sample(key, per_dataset)
        preds = []
        for i in range(0, len(sample), 32):
            preds += vision.classify_images([b for b, _ in sample[i:i + 32]])
        rows = []
        for (_, lab), p in zip(sample, preds):
            truth = ds["map"][lab]
            pred = p["stream"]
            if key == "organic":
                pred = "organic" if pred == "organic" else "not_organic"
            rows.append({"label": lab, "truth": truth, "pred": pred, "conf": p["confidence"], "top": p["top"][0]["label"]})
        scored = [r for r in rows if r["truth"] is not None]
        acc = float(np.mean([r["truth"] == r["pred"] for r in scored])) if scored else None
        per_class = {}
        for t in sorted({r["truth"] for r in scored}):
            sub = [r for r in scored if r["truth"] == t]
            per_class[t] = {"n": len(sub), "recall": round(float(np.mean([r["pred"] == t for r in sub])), 3)}
        for t in sorted({r["pred"] for r in scored}):
            sub = [r for r in scored if r["pred"] == t]
            per_class.setdefault(t, {"n": 0})["precision"] = round(float(np.mean([r["truth"] == t for r in sub])), 3)
        confusion = defaultdict(Counter)
        for r in scored:
            confusion[r["truth"]][r["pred"]] += 1
        # Calibration: accuracy among confident predictions
        hi = [r for r in scored if r["conf"] >= 0.8]
        report["datasets"][key] = {
            "dataset": ds["id"], "n": len(rows), "n_scored": len(scored), "stream_accuracy": round(acc, 4) if acc is not None else None,
            "per_class": per_class, "confusion": {k: dict(v) for k, v in confusion.items()},
            "confident_share": round(len(hi) / max(1, len(scored)), 3),
            "confident_accuracy": round(float(np.mean([r["truth"] == r["pred"] for r in hi])), 4) if hi else None,
            "unscored_labels": dict(Counter(r["label"] for r in rows if r["truth"] is None)),
            "unscored_predicted_as": dict(Counter(r["pred"] for r in rows if r["truth"] is None)),
        }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "vision_eval.json").write_text(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-dataset", type=int, default=300)
    a = ap.parse_args()
    print(json.dumps(evaluate(a.per_dataset), indent=2))
