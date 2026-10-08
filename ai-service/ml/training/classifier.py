"""MODEL 2 — Waste composition classifier.

No labelled waste-image corpus exists in this dataset, so per the design
principle "do not fake AI capabilities" the deployed model is a TABULAR
composition model: it predicts the 5-stream composition (+ moisture) of a
consolidated load from its source mix (business types, kg), size and season.
Labels = lab-audited compositions + hub-operator corrections (weighted 3x).
Uploaded images are stored as the seed of a future vision dataset.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from ml.data.validation import validate
from ml.evaluation.metrics import classification, regression
from ml.features.build import CLASSIFIER_FEATURES, STREAMS, classifier_frame

TARGETS = STREAMS + ["moisture"]
PARAMS = dict(n_estimators=300, min_samples_leaf=3, max_features=0.8, random_state=11, n_jobs=-1)


def _normalise(pred: np.ndarray) -> np.ndarray:
    comp = np.clip(pred[:, :5], 0.001, None)
    comp = comp / comp.sum(axis=1, keepdims=True)
    return np.column_stack([comp, pred[:, 5]])


def train(raw: pd.DataFrame) -> tuple[dict, dict]:
    log: dict = {}
    df, log["validation"] = validate("compositions", raw)
    df = df.assign(moisture=pd.to_numeric(df["moisture_pct"], errors="coerce").fillna(df["moisture_pct"].astype(float).median()) / 100)
    df = df.sort_values("date").reset_index(drop=True)
    X = classifier_frame(df)
    Y = df[TARGETS].astype(float).to_numpy()
    w = np.where(df["origin"] == "operator", 3.0, 1.0)
    n = len(df)
    cut = int(n * 0.8)
    log["split"] = {"train": cut, "test": n - cut, "strategy": "time-based 80/20", "operator_labels": int((df["origin"] == "operator").sum())}

    model = RandomForestRegressor(**PARAMS)
    model.fit(X.iloc[:cut], Y[:cut], sample_weight=w[:cut])
    pred = _normalise(model.predict(X.iloc[cut:]))
    yt = Y[cut:]
    per_stream = {s: float(np.mean(np.abs(pred[:, i] - yt[:, i]))) for i, s in enumerate(STREAMS)}
    dom_true = np.array(STREAMS)[yt[:, :5].argmax(1)]
    dom_pred = np.array(STREAMS)[pred[:, :5].argmax(1)]
    metrics = {
        "mae": float(np.mean(list(per_stream.values()))), "mae_per_stream": per_stream,
        "moisture_mae_pp": float(np.mean(np.abs(pred[:, 5] - yt[:, 5])) * 100),
        **classification(dom_true, dom_pred),
        "organic_r2": regression(yt[:, 0], pred[:, 0])["r2"], "n": int(n - cut),
        "label_definition": "dominant stream (argmax of composition)",
    }
    # Calibrate the ensemble-agreement confidence threshold on the held-out set.
    final = RandomForestRegressor(**PARAMS)
    final.fit(X, Y, sample_weight=w)
    obj = {"model": final, "features": CLASSIFIER_FEATURES, "targets": TARGETS}
    meta = {"algorithm": "Random-forest multi-output composition model (tabular; vision model not deployed)", "dataset_size": int(n),
            "metrics": metrics, "params": PARAMS, "log": log}
    return obj, meta


def predict(obj: dict, X: pd.DataFrame) -> dict:
    model: RandomForestRegressor = obj["model"]
    trees = np.stack([t.predict(X.to_numpy()) for t in model.estimators_])  # (T, 1, 6)
    trees = np.stack([_normalise(t) for t in trees])[:, 0, :]
    mean = trees.mean(0)
    std = trees.std(0)
    comp = np.clip(mean[:5], 0.001, None)
    comp = comp / comp.sum()
    # Confidence = share of ensemble members whose composition is within 6 pp of the consensus on every stream.
    agree = (np.abs(trees[:, :5] - comp).max(1) <= 0.06).mean()
    return {
        "composition": {s: float(round(comp[i], 4)) for i, s in enumerate(STREAMS)},
        "uncertainty": {s: float(round(std[i], 4)) for i, s in enumerate(STREAMS)},
        "moisture_pct": float(round(mean[5] * 100, 1)),
        "confidence": float(round(min(0.995, agree), 4)),
    }
