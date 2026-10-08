"""Data validation stage: schema + range checks. Rows that fail are dropped
and counted; the counts go into the training-run log so data quality is
visible on the AI Model dashboard."""
from __future__ import annotations

import pandas as pd

SCHEMAS: dict[str, dict[str, tuple]] = {
    "waste_records": {"source_id": (None, None), "business_type": (None, None), "date": (None, None), "kg": (0, 1e6)},
    "compositions": {"organic": (0, 1), "plastic": (0, 1), "paper": (0, 1), "metal": (0, 1), "other": (0, 1), "total_kg": (1, 1e6), "month": (1, 12)},
    "energy": {"stream": (None, None), "technology": (None, None), "input_kg": (0.1, 1e6), "actual_kwh": (0, 1e7), "efficiency_pct": (0, 100), "compatibility_pct": (0, 100), "utilization_pct": (0, 100), "month": (1, 12)},
}


def validate(name: str, df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    schema = SCHEMAS[name]
    report: dict = {"rows_in": int(len(df)), "missing_columns": [], "dropped": {}}
    missing = [c for c in schema if c not in df.columns]
    if missing:
        report["missing_columns"] = missing
        raise ValueError(f"{name}: missing required columns {missing}")
    out = df.copy()
    for col, (lo, hi) in schema.items():
        before = len(out)
        if lo is None:
            out = out[out[col].notna()]
        else:
            vals = pd.to_numeric(out[col], errors="coerce")
            out = out[vals.between(lo, hi)]
        if len(out) < before:
            report["dropped"][col] = int(before - len(out))
    if name == "compositions":
        s = out[["organic", "plastic", "paper", "metal", "other"]].sum(axis=1)
        bad = (s - 1).abs() > 0.03
        report["dropped"]["composition_sum"] = int(bad.sum())
        out = out[~bad]
    report["rows_out"] = int(len(out))
    return out.reset_index(drop=True), report
