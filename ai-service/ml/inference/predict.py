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
# Photo evidence weights by vision confidence. Thresholds come from the independent real-photo
# evaluation (ml/evaluation/reports/vision_eval.json): predictions >= 0.8 were right ~80–91% of the
# time, below 0.5 close to chance, so those photos are not used and are flagged for human review.
VISION_WEIGHT = [(0.8, 1.0), (0.5, 0.5)]
PRIOR_PSEUDO_ITEMS = 8.0  # how many "virtual sampled items" the tabular prior is worth


def _vision_weight(conf: float) -> float:
    for thr, w in VISION_WEIGHT:
        if conf >= thr:
            return w
    return 0.0


def classify(total_kg: float, month: int, source_mix: list[dict], images: list[bytes] | None = None) -> dict:
    """Load composition = tabular prior (source mix) updated by a photo sample audit.

    Each photo is one randomly sampled item from the load. With a Dirichlet prior
    alpha = k * prior_composition, every usable photo adds its stream probabilities
    (weighted by confidence) as soft counts; the posterior mean is the composition.
    Vision streams glass/textile map to WattCycle's `other` stream.
    """
    e = _need("classifier")
    X = pd.DataFrame([mix_features(source_mix, total_kg, month)], columns=e["model"]["features"])
    res = clf_train.predict(e["model"], X)
    method = "tabular composition model (source mix)"
    vision_out = None
    if images:
        from ml.inference import vision
        photos = vision.classify_images(images)
        counts = {s: PRIOR_PSEUDO_ITEMS * res["composition"][s] for s in res["composition"]}
        used = 0.0
        for p in photos:
            w = _vision_weight(p["confidence"])
            p["weight"] = w
            p["needs_review"] = w == 0.0
            for vs, pv in p["streams"].items():
                counts["other" if vs in ("glass", "textile") else vs] += w * pv
            used += w
        tot = sum(counts.values())
        prior_comp = res["composition"]
        res["composition"] = {s: round(v / tot, 4) for s, v in counts.items()}
        # Confidence: concentration-weighted blend of model confidence and photo confidence.
        photo_conf = sum(p["weight"] * p["confidence"] for p in photos)
        res["confidence"] = round((PRIOR_PSEUDO_ITEMS * res["confidence"] + photo_conf) / (PRIOR_PSEUDO_ITEMS + used), 4)
        vision_out = {"model": vision.MODEL_ID, "photos": photos, "used_weight": used, "prior_composition": prior_comp,
                      "flagged_for_review": sum(1 for p in photos if p["needs_review"])}
        method = f"tabular prior + {len(photos)}-photo sample audit (EfficientNetB0 vision model)"
    detected = sorted(({"stream": s, "pct": round(v * 100, 1), "kg": round(v * total_kg, 1)} for s, v in res["composition"].items()), key=lambda d: -d["kg"])
    return {
        **res, "detected": detected, "model_version": e["version"], "method": method, "vision": vision_out,
        "model_metrics": {k: e["meta"]["metrics"].get(k) for k in ("mae", "f1", "precision", "recall")},
    }


# ------------------------------------------------------------------ energy
# Predicted energy is ELECTRICITY (kWh_e), the quantity Delhi's plants report (MW).
# Biogas: ~6 kWh/m³ (60% CH4) and ~33% gas-engine efficiency -> ~2 kWh_e per m³; recoverable heat ~45%.
CHP = {"biogas_kwh_per_m3": 6.0, "electrical_eff": 0.33, "heat_eff": 0.45}


def _energy_split(technology: str, kwh: float) -> dict:
    """Engineering conversion of predicted electricity into biogas volume / recoverable heat (documented factors)."""
    if technology == "anaerobic_digestion":
        biogas = kwh / (CHP["biogas_kwh_per_m3"] * CHP["electrical_eff"])
        return {"biogas_m3": round(biogas, 1), "electricity_kwh": round(kwh, 1), "heat_kwh": round(biogas * CHP["biogas_kwh_per_m3"] * CHP["heat_eff"], 1)}
    if technology == "combustion":
        return {"biogas_m3": None, "electricity_kwh": round(kwh, 1), "heat_kwh": 0.0}  # Delhi WtE plants are power-only
    return {"biogas_m3": None, "electricity_kwh": 0.0, "heat_kwh": 0.0}


def predict_facility(stream: str, kg: float, moisture_pct: float, month: int, f: dict) -> dict:
    e = _need("energy")
    obj = e["model"]
    hist = f.get("historical_yield_kwh_per_kg")
    if hist is None:
        hist = obj["stream_tech_yield"].get((stream, f["technology"]), 0.0)
    row = energy_row(stream, f["technology"], f["efficiency_pct"], f["compatibility_pct"], f["utilization_pct"], f["capacity_tpd"], moisture_pct, kg, month, hist)
    raw = float(obj["model"].predict(pd.DataFrame([row], columns=obj["features"]))[0])
    if obj.get("target") == "log_ratio_to_hist_yield":
        yld = hist * float(np.exp(raw)) if hist > 0 else 0.0
    else:
        yld = max(0.0, raw)
    kwh = yld * kg
    sg = obj["sigma"].get(stream, obj["sigma"]["_default"])
    if not f.get("n_history"):
        sg *= 1.6  # no history at this facility for this stream -> wider uncertainty
    return {"predicted_kwh": round(kwh, 1), "yield_kwh_per_kg": round(yld, 4), "interval": [round(kwh * (1 - 1.645 * sg), 1), round(kwh * (1 + 1.645 * sg), 1)],
            "sigma_rel": sg, "confidence": round(energy_confidence(sg), 4), **_energy_split(f["technology"], kwh)}


# Pathways that exist in Delhi's real network (WtE, biomethanation, MRF, sanitary landfill).
PATHWAYS = {
    "organic": ["anaerobic_digestion", "combustion", "landfill"],
    "plastic": ["combustion", "material_recovery", "landfill"],
    "paper": ["material_recovery", "combustion", "landfill"],
    "metal": ["material_recovery"],
    "other": ["combustion", "landfill"],
}
# Used only when a technology has no metered history in our data (e.g. a plant still commissioning).
# Biomethanation: Indian plant data 0.08–0.2 kWh_e per kg wet waste (Bangalore 8 t/day -> ~645 kWh/day; vendor norms).
REFERENCE_YIELD = {("organic", "anaerobic_digestion"): 0.15}


def pathways(stream: str, kg: float, moisture_pct: float, month: int, available: list[str]) -> dict:
    e = _need("energy")
    obj = e["model"]
    options = []
    for tech in PATHWAYS.get(stream, []):
        if tech == "material_recovery":
            options.append({"technology": tech, "expected_kwh": 0.0, "available": tech in available, "basis": "material recovery (no energy generated; avoids virgin production)", "confidence": None, "interval": None, **_energy_split(tech, 0)})
            continue
        if tech == "landfill":
            options.append({"technology": tech, "expected_kwh": 0.0, "available": tech in available, "basis": "sanitary landfill (no energy recovery in Delhi)", "confidence": None, "interval": None, **_energy_split(tech, 0)})
            continue
        prof = obj["tech_profile"].get(tech)
        if prof is None:
            if (stream, tech) not in REFERENCE_YIELD:
                continue
            k = REFERENCE_YIELD[(stream, tech)] * kg
            options.append({"technology": tech, "expected_kwh": round(k, 1), "available": tech in available, "basis": "Indian plant reference yield (no metered history yet)", "confidence": None, "interval": None, **_energy_split(tech, k)})
            continue
        p = predict_facility(stream, kg, moisture_pct, month, {"technology": tech, **prof, "historical_yield_kwh_per_kg": obj["stream_tech_yield"].get((stream, tech)), "n_history": 1})
        options.append({"technology": tech, "expected_kwh": p["predicted_kwh"], "available": tech in available, "basis": "ML model @ network-average facility", "confidence": p["confidence"], "interval": p["interval"],
                        "biogas_m3": p["biogas_m3"], "electricity_kwh": p["electricity_kwh"], "heat_kwh": p["heat_kwh"]})
    options.sort(key=lambda o: (o["available"], o["expected_kwh"]), reverse=True)
    rec = next((o for o in options if o["available"]), options[0] if options else None)
    if rec is None:
        return {"stream": stream, "kg": kg, "options": [], "recommended": None, "reason": "No pathway", "model_version": e["version"]}
    if rec["technology"] == "material_recovery":
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
