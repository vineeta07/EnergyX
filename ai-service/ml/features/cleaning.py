"""Cleaning stage: missing-value handling and outlier detection."""
from __future__ import annotations

import numpy as np
import pandas as pd


def regularise_daily(df: pd.DataFrame, key: str = "source_id") -> tuple[pd.DataFrame, dict]:
    """Reindex each source to a continuous daily calendar.
    Missing days -> time interpolation (flagged `imputed`).
    Outliers -> robust z-score on a 15-day rolling median/MAD; |z| > 5 replaced by the rolling median (flagged `outlier`).
    """
    frames = []
    imputed = outliers = 0
    for sid, g in df.groupby(key):
        g = g.assign(date=pd.to_datetime(g["date"])).groupby("date", as_index=True).agg(
            kg=("kg", "sum"), business_type=("business_type", "first"), waste_type=("waste_type", "first"), avg_daily_kg=("avg_daily_kg", "first"))
        idx = pd.date_range(g.index.min(), g.index.max(), freq="D")
        g = g.reindex(idx)
        g["imputed"] = g["kg"].isna()
        imputed += int(g["imputed"].sum())
        g["kg"] = g["kg"].interpolate(method="time").bfill().ffill()
        for c in ("business_type", "waste_type", "avg_daily_kg"):
            g[c] = g[c].ffill().bfill()
        med = g["kg"].rolling(15, center=True, min_periods=5).median()
        mad = (g["kg"] - med).abs().rolling(15, center=True, min_periods=5).median()
        z = (g["kg"] - med) / (1.4826 * mad.replace(0, np.nan))
        out = z.abs() > 5
        g["outlier"] = out.fillna(False)
        outliers += int(g["outlier"].sum())
        g.loc[g["outlier"], "kg"] = med[g["outlier"]]
        g[key] = sid
        frames.append(g.rename_axis("date").reset_index())
    res = pd.concat(frames, ignore_index=True) if frames else df
    return res, {"imputed_days": imputed, "outliers_replaced": outliers}


def winsorize(s: pd.Series, lo=0.005, hi=0.995) -> pd.Series:
    a, b = s.quantile(lo), s.quantile(hi)
    return s.clip(a, b)
