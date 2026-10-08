"""MODEL 1 — Waste generation forecasting (LightGBM on scale-normalised lag features)."""
from __future__ import annotations

import lightgbm as lgb
import numpy as np
import pandas as pd

from ml.data.validation import validate
from ml.evaluation.metrics import regression
from ml.features.build import FORECAST_FEATURES, forecast_frame
from ml.features.cleaning import regularise_daily

PARAMS = dict(n_estimators=400, learning_rate=0.04, num_leaves=31, min_child_samples=20, subsample=0.9, subsample_freq=1,
              colsample_bytree=0.9, reg_lambda=1.0, random_state=7, verbose=-1)


def train(raw: pd.DataFrame) -> tuple[dict, dict]:
    log: dict = {}
    df, log["validation"] = validate("waste_records", raw)
    daily, log["cleaning"] = regularise_daily(df)
    f = forecast_frame(daily)
    log["features"] = FORECAST_FEATURES
    # Time-based split: last 14 days test, previous 14 validation, rest train.
    f["date"] = pd.to_datetime(f["date"])
    end = f["date"].max()
    test = f[f["date"] > end - pd.Timedelta(days=14)]
    val = f[(f["date"] > end - pd.Timedelta(days=28)) & (f["date"] <= end - pd.Timedelta(days=14))]
    tr = f[f["date"] <= end - pd.Timedelta(days=28)]
    log["split"] = {"train": len(tr), "validation": len(val), "test": len(test), "strategy": "time-based (last 14d test, prior 14d validation)"}

    model = lgb.LGBMRegressor(**PARAMS)
    model.fit(tr[FORECAST_FEATURES], tr["y"], eval_X=(val[FORECAST_FEATURES],), eval_y=(val["y"],), callbacks=[lgb.early_stopping(40, verbose=False)])
    best_iter = model.best_iteration_ or PARAMS["n_estimators"]

    val_res = (val["y"] - model.predict(val[FORECAST_FEATURES])).to_numpy()
    q_lo, q_hi = np.quantile(val_res, [0.1, 0.9])
    test_pred = model.predict(test[FORECAST_FEATURES]) * test["scale"]
    metrics = regression(test["kg"], test_pred)
    # Seasonal-naive baseline (same weekday last week) for honest comparison.
    naive = test["lag7"] * test["scale"]
    metrics["baseline_mape_seasonal_naive"] = regression(test["kg"], naive)["mape"]

    # Refit on all data with the tuned iteration count for deployment.
    final = lgb.LGBMRegressor(**{**PARAMS, "n_estimators": best_iter})
    final.fit(f[FORECAST_FEATURES], f["y"])
    imp = dict(zip(FORECAST_FEATURES, map(float, final.booster_.feature_importance("gain"))))
    tot = sum(imp.values()) or 1
    obj = {"model": final, "resid_q": (float(q_lo), float(q_hi)), "features": FORECAST_FEATURES}
    meta = {"algorithm": "LightGBM regressor (recursive multi-step)", "dataset_size": int(len(f)), "metrics": metrics,
            "params": {**PARAMS, "n_estimators": int(best_iter)}, "feature_importance": {k: v / tot for k, v in imp.items()}, "log": log}
    return obj, meta
