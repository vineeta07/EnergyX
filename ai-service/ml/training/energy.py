"""MODEL 3 — Energy yield prediction (LightGBM on kWh-per-kg).

Target is yield (kWh/kg) so the model generalises across batch sizes;
predicted kWh = yield x kg. Uncertainty: per-stream relative residual spread
on a time-ordered validation fold -> 90% interval and a calibrated
confidence = P(|error| <= 10%) under a normal residual model.
"""
from __future__ import annotations

import math

import lightgbm as lgb
import numpy as np
import pandas as pd

from ml.data.validation import validate
from ml.evaluation.metrics import regression
from ml.features.build import ENERGY_FEATURES, FEATURE_GROUPS, add_hist_yield, energy_frame

PARAMS = dict(n_estimators=600, max_depth=5, learning_rate=0.04, subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0, random_state=3)


def _make(n_estimators: int):
    return lgb.LGBMRegressor(**{**PARAMS, "n_estimators": n_estimators}, num_leaves=31, min_child_samples=8, subsample_freq=1, verbose=-1)


def _fit(model, X, y, Xv=None, yv=None):
    if Xv is None:
        model.fit(X, y)
    else:
        model.fit(X, y, eval_X=(Xv,), eval_y=(yv,), callbacks=[lgb.early_stopping(50, verbose=False)])
    return model


def _best_iter(model) -> int:
    return int(model.best_iteration_ or PARAMS["n_estimators"])


def _gain(model) -> dict:
    return dict(zip(model.feature_name_, map(float, model.booster_.feature_importance("gain"))))


def train(raw: pd.DataFrame) -> tuple[dict, dict]:
    log: dict = {}
    df, log["validation"] = validate("energy", raw)
    df = df[df["technology"] != "material_recovery"].copy()
    df["recorded_at"] = pd.to_datetime(df["recorded_at"], utc=True)
    df["moisture_pct"] = pd.to_numeric(df["moisture_pct"], errors="coerce")
    miss = int(df["moisture_pct"].isna().sum())
    df["moisture_pct"] = df.groupby("stream")["moisture_pct"].transform(lambda s: s.fillna(s.median()))
    log["cleaning"] = {"moisture_imputed": miss}
    df = add_hist_yield(df).reset_index(drop=True)
    # Outlier screen on yield (robust z within stream+technology); excluded from training, kept in snapshot.
    g = df.groupby(["stream", "technology"])["yield"]
    med = g.transform("median")
    mad = g.transform(lambda s: (s - s.median()).abs().median())
    z = (df["yield"] - med) / (1.4826 * mad.replace(0, np.nan))
    keep = ~(z.abs() > 6).fillna(False)
    log["cleaning"]["yield_outliers_excluded"] = int((~keep).sum())
    df = df[keep].reset_index(drop=True)
    X = energy_frame(df)
    y = df["yield"].to_numpy()
    n = len(df)
    a, b = int(n * 0.7), int(n * 0.8)
    log["split"] = {"train": a, "validation": b - a, "test": n - b, "strategy": "time-ordered 70/10/20", "live_feedback_rows": int(df["is_live_feedback"].sum())}

    model = _fit(_make(PARAMS["n_estimators"]), X.iloc[:a], y[:a], X.iloc[a:b], y[a:b])
    best = _best_iter(model)

    val_pred = model.predict(X.iloc[a:b])
    rel = (y[a:b] - val_pred) / np.maximum(val_pred, 1e-6)
    sigma = {}
    for s in df["stream"].unique():
        m = (df["stream"].iloc[a:b] == s).to_numpy()
        sigma[s] = float(np.std(rel[m])) if m.sum() >= 5 else float(np.std(rel))
    sigma["_default"] = float(np.std(rel))

    test_pred_kwh = model.predict(X.iloc[b:]) * df["input_kg"].iloc[b:].to_numpy()
    test_true = df["actual_kwh"].iloc[b:].to_numpy()
    metrics = regression(test_true, test_pred_kwh)
    metrics["yield_mae_kwh_per_kg"] = float(np.mean(np.abs(model.predict(X.iloc[b:]) - y[b:])))
    # Naive baseline: facility historical yield x kg
    metrics["baseline_mape_hist_yield"] = regression(test_true, df["hist_yield"].iloc[b:].to_numpy() * df["input_kg"].iloc[b:].to_numpy())["mape"]
    backtest = []
    for i, row in enumerate(df.iloc[b:].itertuples()):
        p = float(test_pred_kwh[i])
        sg = sigma.get(row.stream, sigma["_default"])
        backtest.append({"output_id": int(row.id), "technology": row.technology, "predicted_kwh": round(p, 1),
                         "interval": [round(p * (1 - 1.645 * sg), 1), round(p * (1 + 1.645 * sg), 1)], "confidence": round(confidence(sg), 4)})

    final = _fit(_make(best), X, y)
    gain = _gain(final)
    tot = sum(gain.values()) or 1
    by_feat = {f: gain.get(f, 0.0) / tot for f in ENERGY_FEATURES}
    groups = {g_: float(sum(by_feat[f] for f in fs)) for g_, fs in FEATURE_GROUPS.items()}
    # Global yield stats (for pathway estimates at network-average facilities)
    obj = {"model": final, "features": ENERGY_FEATURES, "sigma": sigma, "group_importance": groups,
           "stream_tech_yield": df.groupby(["stream", "technology"])["yield"].mean().to_dict(),
           "tech_profile": df.groupby("technology")[["efficiency_pct", "compatibility_pct", "utilization_pct", "capacity_tpd"]].mean().to_dict("index")}
    meta = {"algorithm": "LightGBM regressor (yield kWh/kg)", "dataset_size": int(n), "metrics": metrics,
            "params": {**PARAMS, "n_estimators": best}, "feature_importance": groups, "sigma": sigma, "log": log}
    return obj, meta, backtest


def confidence(sigma_rel: float) -> float:
    """P(|relative error| <= 10%) for a normal residual with std sigma_rel."""
    if sigma_rel <= 0:
        return 0.99
    return float(min(0.99, math.erf(0.10 / (sigma_rel * math.sqrt(2)))))
