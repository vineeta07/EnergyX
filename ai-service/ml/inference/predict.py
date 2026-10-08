"""Online inference for forecast / classifier / energy models."""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from ml.features.build import BUSINESS_TYPES, energy_row, mix_features, month_cyc
from ml.models import registry
from ml.training import classifier as clf_train
from ml.training.energy import confidence as energy_confidence


class ModelNotReady(Exception):
    pass


def _need(key: str) -> dict:
    e = registry.load(key)
    if not e:
        raise ModelNotReady(f"Model '{key}' is not trained yet (bootstrap training in progress)")
    return e


# ------------------------------------------------------------------ forecast
def forecast(source: dict, history: list[dict], horizon: int = 7) -> dict:
    e = _need("forecast")
    obj = e["model"]
    h = pd.DataFrame(history)
    if len(h) >= 14:
        s = h.assign(date=pd.to_datetime(h["date"])).set_index("date")["kg"].astype(float).asfreq("D").interpolate().bfill()
        method = "lightgbm"
    else:
        # Cold start: anchor on declared average (forecast still runs through the model with flat lags).
        idx = pd.date_range(end=pd.Timestamp(date.today() - timedelta(days=1)), periods=14, freq="D")
        s = pd.Series(float(source["avg_daily_kg"]), index=idx)
        method = "lightgbm (cold-start: declared average used as lag history)"
    scale = float(s.median()) or 1.0
    y = list((s / scale).to_numpy())
    last = s.index.max()
    start = max(last + pd.Timedelta(days=1), pd.Timestamp(date.today()))
    # roll forward any gap between last observation and today
    cur = last + pd.Timedelta(days=1)
    out = []
    btype = BUSINESS_TYPES.index(source["business_type"]) if source["business_type"] in BUSINESS_TYPES else len(BUSINESS_TYPES)
    q_lo, q_hi = obj["resid_q"]
    steps = 0
    while len(out) < horizon and steps < horizon + 60:
        steps += 1
        ms, mc = month_cyc(cur.month)
        feats = {"lag1": y[-1], "lag2": y[-2], "lag7": y[-7], "roll7": float(np.mean(y[-7:])), "roll14": float(np.mean(y[-14:])),
                 "dow": cur.dayofweek, "is_weekend": int(cur.dayofweek >= 5), "month_sin": float(ms), "month_cos": float(mc), "dom": cur.day, "btype": btype}
        p = float(obj["model"].predict(pd.DataFrame([feats], columns=obj["features"]))[0])
        y.append(p)
        if cur >= start:
            # interval widens with horizon (sqrt-h scaling of one-step residual quantiles)
            k = np.sqrt(len(out) + 1)
            out.append({"date": cur.strftime("%Y-%m-%d"), "kg": round(p * scale, 1), "low": round(max(0, (p + q_lo * k) * scale), 1), "high": round((p + q_hi * k) * scale, 1)})
        cur += pd.Timedelta(days=1)
    return {"forecast": out, "total_kg": round(sum(o["kg"] for o in out), 1), "model_version": e["version"], "method": method,
            "test_mape": e["meta"]["metrics"].get("mape"), "baseline_mape": e["meta"]["metrics"].get("baseline_mape_seasonal_naive")}


# ------------------------------------------------------------------ classifier
def classify(total_kg: float, month: int, source_mix: list[dict], has_image: bool = False) -> dict:
    e = _need("classifier")
    X = pd.DataFrame([mix_features(source_mix, total_kg, month)], columns=e["model"]["features"])
    res = clf_train.predict(e["model"], X)
    detected = sorted(({"stream": s, "pct": round(v * 100, 1), "kg": round(v * total_kg, 1)} for s, v in res["composition"].items()), key=lambda d: -d["kg"])
    return {
        **res, "detected": detected, "model_version": e["version"],
        "method": "tabular composition model" + (" (image stored for vision dataset — no vision model deployed)" if has_image else ""),
        "model_metrics": {k: e["meta"]["metrics"].get(k) for k in ("mae", "f1", "precision", "recall")},
    }


# ------------------------------------------------------------------ energy
CHP = {"biogas_kwh_per_m3": 6.0, "electrical_eff": 0.38, "useful_eff": 0.80}


def _energy_split(technology: str, kwh: float) -> dict:
    """Engineering conversion of predicted useful energy into biogas / electricity / heat (documented factors)."""
    if technology in ("anaerobic_digestion", "landfill_gas"):
        biogas = kwh / (CHP["biogas_kwh_per_m3"] * CHP["useful_eff"])
        elec = biogas * CHP["biogas_kwh_per_m3"] * CHP["electrical_eff"]
        return {"biogas_m3": round(biogas, 1), "electricity_kwh": round(elec, 1), "heat_kwh": round(kwh - elec, 1)}
    if technology in ("combustion", "rdf_coprocessing", "pyrolysis"):
        return {"biogas_m3": None, "electricity_kwh": round(kwh * 0.45, 1), "heat_kwh": round(kwh * 0.55, 1)}
    return {"biogas_m3": None, "electricity_kwh": 0.0, "heat_kwh": 0.0}


def predict_facility(stream: str, kg: float, moisture_pct: float, month: int, f: dict) -> dict:
    e = _need("energy")
    obj = e["model"]
    hist = f.get("historical_yield_kwh_per_kg")
    if hist is None:
        hist = obj["stream_tech_yield"].get((stream, f["technology"]), 0.0)
    row = energy_row(stream, f["technology"], f["efficiency_pct"], f["compatibility_pct"], f["utilization_pct"], f["capacity_tpd"], moisture_pct, kg, month, hist)
    yld = max(0.0, float(obj["model"].predict(pd.DataFrame([row], columns=obj["features"]))[0]))
    kwh = yld * kg
    sg = obj["sigma"].get(stream, obj["sigma"]["_default"])
    if not f.get("n_history"):
        sg *= 1.6  # no history at this facility for this stream -> wider uncertainty
    return {"predicted_kwh": round(kwh, 1), "yield_kwh_per_kg": round(yld, 4), "interval": [round(kwh * (1 - 1.645 * sg), 1), round(kwh * (1 + 1.645 * sg), 1)],
            "sigma_rel": sg, "confidence": round(energy_confidence(sg), 4), **_energy_split(f["technology"], kwh)}


PATHWAYS = {
    "organic": ["anaerobic_digestion", "combustion", "landfill_gas"],
    "plastic": ["rdf_coprocessing", "pyrolysis", "combustion"],
    "paper": ["material_recovery", "combustion"],
    "metal": ["material_recovery"],
    "other": ["combustion", "landfill_gas"],
}
# Landfill gas capture is not a facility in this network: its yield comes from a literature factor, flagged as such.
REFERENCE_YIELD = {("organic", "landfill_gas"): 0.145, ("other", "landfill_gas"): 0.05}


def pathways(stream: str, kg: float, moisture_pct: float, month: int, available: list[str]) -> dict:
    e = _need("energy")
    obj = e["model"]
    options = []
    for tech in PATHWAYS.get(stream, []):
        if tech == "material_recovery":
            options.append({"technology": tech, "expected_kwh": 0.0, "available": tech in available, "basis": "material recovery (no energy generated; avoids virgin production)", "confidence": None, "interval": None, **_energy_split(tech, 0)})
            continue
        if (stream, tech) in REFERENCE_YIELD and tech not in available:
            k = REFERENCE_YIELD[(stream, tech)] * kg
            options.append({"technology": tech, "expected_kwh": round(k, 1), "available": False, "basis": "literature reference factor (no facility in network)", "confidence": None, "interval": None, **_energy_split(tech, k)})
            continue
        prof = obj["tech_profile"].get(tech)
        if prof is None:
            # Technology never observed: fall back to a conservative engineering factor and say so.
            k = {"combustion": 0.30, "pyrolysis": 1.0}.get(tech, 0.2) * kg * (1 if stream == "plastic" else 0.8)
            options.append({"technology": tech, "expected_kwh": round(k, 1), "available": tech in available, "basis": "engineering factor (no training data for this technology)", "confidence": None, "interval": None, **_energy_split(tech, k)})
            continue
        p = predict_facility(stream, kg, moisture_pct, month, {"technology": tech, **prof, "historical_yield_kwh_per_kg": obj["stream_tech_yield"].get((stream, tech)), "n_history": 1})
        options.append({"technology": tech, "expected_kwh": p["predicted_kwh"], "available": tech in available, "basis": "ML model @ network-average facility", "confidence": p["confidence"], "interval": p["interval"],
                        "biogas_m3": p["biogas_m3"], "electricity_kwh": p["electricity_kwh"], "heat_kwh": p["heat_kwh"]})
    options.sort(key=lambda o: (o["available"], o["expected_kwh"]), reverse=True)
    rec = next((o for o in options if o["available"]), options[0] if options else None)
    if rec is None:
        return {"stream": stream, "kg": kg, "options": [], "recommended": None, "reason": "No pathway", "model_version": e["version"]}
    if stream in ("paper", "metal"):
        reason = "Material recovery retains more embodied energy than combustion for this stream."
    else:
        alt = next((o for o in options if o is not rec and o["expected_kwh"] > 0), None)
        reason = "Highest predicted useful energy output with available compatible facilities." + (f" {round(rec['expected_kwh'] - alt['expected_kwh'])} kWh more than {alt['technology'].replace('_', ' ')}." if alt else "")
    return {"stream": stream, "kg": round(kg, 1), "moisture_pct": moisture_pct, "options": options, "recommended": rec["technology"], "reason": reason, "model_version": e["version"]}


def model_feature_importance() -> list[dict]:
    e = registry.load("energy")
    if not e:
        return []
    return [{"feature": k, "importance": round(v, 4)} for k, v in sorted(e["model"]["group_importance"].items(), key=lambda x: -x[1])]
