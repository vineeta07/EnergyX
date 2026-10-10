"""Feature engineering for the three learned models."""
from __future__ import annotations

import numpy as np
import pandas as pd

BUSINESS_TYPES = ["restaurant", "hotel", "market", "food_processing", "agriculture", "manufacturing", "municipal"]
STREAMS = ["organic", "plastic", "paper", "metal", "other"]
TECHNOLOGIES = ["anaerobic_digestion", "combustion", "landfill", "material_recovery"]


def month_cyc(m) -> tuple:
    m = np.asarray(m, dtype=float)
    return np.sin(2 * np.pi * (m - 1) / 12), np.cos(2 * np.pi * (m - 1) / 12)


# ------------------------------------------------------------------ forecasting
FORECAST_FEATURES = ["lag1", "lag2", "lag7", "roll7", "roll14", "dow", "is_weekend", "month_sin", "month_cos", "dom", "btype"]


def forecast_frame(daily: pd.DataFrame) -> pd.DataFrame:
    """Per-source scale-normalised lag features. Target `y` = kg / source scale."""
    frames = []
    for sid, g in daily.sort_values("date").groupby("source_id"):
        g = g.copy()
        scale = float(g["kg"].median()) or 1.0
        y = g["kg"] / scale
        g["scale"] = scale
        g["y"] = y
        g["lag1"] = y.shift(1)
        g["lag2"] = y.shift(2)
        g["lag7"] = y.shift(7)
        g["roll7"] = y.shift(1).rolling(7).mean()
        g["roll14"] = y.shift(1).rolling(14).mean()
        frames.append(g)
    f = pd.concat(frames, ignore_index=True)
    d = pd.to_datetime(f["date"])
    f["dow"] = d.dt.dayofweek
    f["is_weekend"] = (f["dow"] >= 5).astype(int)
    f["month_sin"], f["month_cos"] = month_cyc(d.dt.month)
    f["dom"] = d.dt.day
    f["btype"] = f["business_type"].map({b: i for i, b in enumerate(BUSINESS_TYPES)}).fillna(len(BUSINESS_TYPES)).astype(int)
    return f.dropna(subset=["lag7", "roll14"]).reset_index(drop=True)


# ------------------------------------------------------------------ composition classifier
CLASSIFIER_FEATURES = [f"share_{b}" for b in BUSINESS_TYPES] + ["log_kg", "n_sources", "month_sin", "month_cos"]


def mix_features(source_mix: list[dict], total_kg: float, month: int) -> dict:
    tot = sum(m["kg"] for m in source_mix) or 1.0
    f = {f"share_{b}": 0.0 for b in BUSINESS_TYPES}
    for m in source_mix:
        k = f"share_{m.get('business_type', 'municipal')}"
        if k in f:
            f[k] += m["kg"] / tot
    s, c = month_cyc(month)
    f.update({"log_kg": float(np.log1p(total_kg)), "n_sources": len(source_mix), "month_sin": float(s), "month_cos": float(c)})
    return f


def classifier_frame(comp: pd.DataFrame) -> pd.DataFrame:
    rows = [mix_features(r.source_mix, r.total_kg, int(r.month)) for r in comp.itertuples()]
    X = pd.DataFrame(rows, columns=CLASSIFIER_FEATURES)
    return X


# ------------------------------------------------------------------ energy yield
ENERGY_FEATURES = (
    [f"stream_{s}" for s in STREAMS] + [f"tech_{t}" for t in TECHNOLOGIES]
    + ["efficiency", "compatibility", "utilization", "over_capacity", "capacity_tpd", "moisture", "moisture_dev_ad", "log_kg", "month_sin", "month_cos", "hist_yield"]
)


def energy_row(stream: str, technology: str, efficiency_pct: float, compatibility_pct: float, utilization_pct: float,
               capacity_tpd: float, moisture_pct: float, input_kg: float, month: int, hist_yield: float) -> dict:
    s, c = month_cyc(month)
    m = (moisture_pct if moisture_pct is not None and not pd.isna(moisture_pct) else 60.0) / 100
    u = utilization_pct / 100
    r = {f"stream_{x}": float(x == stream) for x in STREAMS}
    r.update({f"tech_{x}": float(x == technology) for x in TECHNOLOGIES})
    r.update({
        "efficiency": efficiency_pct / 100, "compatibility": compatibility_pct / 100, "utilization": u,
        "over_capacity": max(0.0, u - 0.85), "capacity_tpd": capacity_tpd, "moisture": m, "moisture_dev_ad": abs(m - 0.75),
        "log_kg": float(np.log1p(input_kg)), "month_sin": float(s), "month_cos": float(c), "hist_yield": hist_yield,
    })
    return r


def add_hist_yield(df: pd.DataFrame) -> pd.DataFrame:
    """Leakage-safe historical yield: expanding mean kWh/kg of this facility+stream using ONLY earlier records.
    Falls back to the earlier global stream+technology mean, then to 0."""
    df = df.sort_values("recorded_at").copy()
    df["yield"] = df["actual_kwh"] / df["input_kg"]
    grp = df.groupby(["facility_id", "stream"])["yield"]
    df["hist_yield"] = grp.transform(lambda s: s.shift(1).expanding().mean())
    glob = df.groupby(["stream", "technology"])["yield"].transform(lambda s: s.shift(1).expanding().mean())
    df["hist_yield"] = df["hist_yield"].fillna(glob).fillna(0.0)
    return df


def energy_frame(df: pd.DataFrame) -> pd.DataFrame:
    rows = [energy_row(r.stream, r.technology, r.efficiency_pct, r.compatibility_pct, r.utilization_pct, r.capacity_tpd,
                       r.moisture_pct, r.input_kg, int(r.month), r.hist_yield) for r in df.itertuples()]
    return pd.DataFrame(rows, columns=ENERGY_FEATURES)


FEATURE_GROUPS = {
    "Facility historical yield": ["hist_yield"],
    "Facility efficiency": ["efficiency"],
    "Waste compatibility": ["compatibility"],
    "Waste stream": [f"stream_{s}" for s in STREAMS],
    "Technology": [f"tech_{t}" for t in TECHNOLOGIES],
    "Moisture": ["moisture", "moisture_dev_ad"],
    "Capacity / load": ["utilization", "over_capacity", "capacity_tpd"],
    "Batch size": ["log_kg"],
    "Seasonality": ["month_sin", "month_cos"],
}
