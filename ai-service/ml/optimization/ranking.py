"""MODEL 4 — Facility ranking / destination optimisation.

Not a classifier: an explicit, configurable multi-criteria utility over every
eligible facility, using the ML energy prediction as its main input.

  U = w1*energy_n + w2*efficiency + w3*compatibility + w4*available_capacity
      - w5*cost_n - w6*carbon_n - w7*distance_n
  score = 100 * (U + sum(w_neg)) / (sum(w_pos) + sum(w_neg))

energy_n is relative to the best candidate; cost/carbon/distance use absolute
scales (₹5,000 / 100 kg CO2 / 100 km) so a facility's penalty does not depend
on which other facilities happen to be in the candidate set.
Decision confidence = share of 1,000 Monte-Carlo draws (energy predictions
sampled from their uncertainty) in which the chosen facility stays #1.
"""
from __future__ import annotations

import numpy as np

from ml.inference.predict import model_feature_importance, predict_facility

SCALES = {"cost": 5000.0, "carbon": 100.0, "distance": 100.0}
POS = ("energy", "efficiency", "compatibility", "capacity")
NEG = ("transport_cost", "carbon", "distance")
LABELS = {"energy": "Energy yield", "efficiency": "Facility efficiency", "compatibility": "Waste compatibility", "capacity": "Available capacity",
          "transport_cost": "Transport cost", "carbon": "Carbon emissions", "distance": "Distance"}


def _eligibility(f: dict, kg: float, moisture: float) -> str | None:
    if f.get("status", "online") != "online":
        return f"facility {f.get('status')}"
    free_t = f["capacity_tpd"] * (1 - f["utilization_pct"] / 100)
    if free_t * 1000 < kg:
        return f"insufficient capacity ({free_t:.1f} t/day free)"
    if f.get("max_moisture_pct") is not None and moisture > f["max_moisture_pct"]:
        return f"moisture {moisture:.0f}% exceeds limit {f['max_moisture_pct']:.0f}%"
    if f["compatibility_pct"] < 50:
        return "stream compatibility below 50%"
    return None


def _components(c: dict, best_kwh: float) -> dict:
    return {
        "energy": c["predicted_kwh"] / best_kwh if best_kwh > 0 else 0.0,
        "efficiency": c["efficiency_pct"] / 100,
        "compatibility": c["compatibility_pct"] / 100,
        "capacity": 1 - c["utilization_pct"] / 100,
        "transport_cost": min(1.0, c["transport_cost_inr"] / SCALES["cost"]),
        "carbon": min(1.0, c["transport_co2_kg"] / SCALES["carbon"]),
        "distance": min(1.0, c["distance_km"] / SCALES["distance"]),
    }


def _score(comp: dict, w: dict) -> float:
    wp = sum(w[k] for k in POS)
    wn = sum(w[k] for k in NEG)
    u = sum(w[k] * comp[k] for k in POS) - sum(w[k] * comp[k] for k in NEG)
    return 100 * (u + wn) / (wp + wn)


def rank(stream: str, kg: float, moisture_pct: float, month: int, facilities: list[dict], weights: dict) -> dict:
    cands = []
    for f in facilities:
        reason = _eligibility(f, kg, moisture_pct)
        p = predict_facility(stream, kg, moisture_pct, month, f) if f["technology"] not in ("material_recovery", "landfill") else {"predicted_kwh": 0.0, "interval": [0, 0], "confidence": None, "sigma_rel": 0}
        cands.append({**{k: f[k] for k in ("id", "code", "label", "name", "technology", "lat", "lng", "efficiency_pct", "utilization_pct", "capacity_tpd", "compatibility_pct",
                                         "distance_km", "transport_cost_inr", "transport_co2_kg", "historical_yield_kwh_per_kg", "n_history")},
                      "facility_id": f["id"], **p, "eligible": reason is None, "exclusion_reason": reason})
    elig = [c for c in cands if c["eligible"]]
    best_kwh = max([c["predicted_kwh"] for c in elig] or [1.0]) or 1.0
    for c in cands:
        comp = _components(c, best_kwh)
        c["components"] = {k: round(v, 4) for k, v in comp.items()}
        c["contributions"] = {k: round(weights[k] * comp[k] * (1 if k in POS else -1), 4) for k in comp}
        c["score"] = round(_score(comp, weights), 1) if c["eligible"] else 0.0
    cands.sort(key=lambda c: (c["eligible"], c["score"]), reverse=True)
    for i, c in enumerate(cands):
        c["rank"] = i + 1
    if not elig:
        return {"ranking": cands, "chosen_facility_id": None, "explanation": {"headline": "No eligible facility", "bullets": [c["exclusion_reason"] for c in cands]},
                "decision_drivers": [], "model_feature_importance": model_feature_importance(), "model_version": None}
    chosen = cands[0]

    # Monte-Carlo stability of the decision under prediction uncertainty.
    rng = np.random.default_rng(7)
    wins = 0
    draws = 1000
    el = [c for c in cands if c["eligible"]]
    for _ in range(draws):
        sampled = [max(0.0, c["predicted_kwh"] * (1 + rng.normal(0, c.get("sigma_rel") or 0.0))) for c in el]
        bk = max(sampled) or 1.0
        scores = [_score({**_components({**c, "predicted_kwh": s}, bk)}, weights) for c, s in zip(el, sampled)]
        wins += int(int(np.argmax(scores)) == 0)
    decision_conf = wins / draws
    chosen["decision_confidence"] = round(decision_conf, 3)

    pos_contrib = {k: abs(v) for k, v in chosen["contributions"].items()}
    tot = sum(pos_contrib.values()) or 1
    drivers = sorted(({"feature": LABELS[k], "key": k, "share": round(v / tot, 4), "direction": "+" if k in POS else "−"} for k, v in pos_contrib.items()), key=lambda d: -d["share"])

    explanation = explain(stream, kg, chosen, el)
    from ml.models import registry
    ev = registry.load("energy")
    return {"ranking": cands, "chosen_facility_id": chosen["facility_id"], "explanation": explanation, "decision_drivers": drivers,
            "model_feature_importance": model_feature_importance(), "decision_confidence": decision_conf, "model_version": f"energy:{ev['version']}+utility-v2" if ev else None}


def explain(stream: str, kg: float, chosen: dict, eligible: list[dict]) -> dict:
    others = [c for c in eligible if c is not chosen]
    bullets: list[str] = []
    comparisons: list[str] = []
    headline = f"{chosen['label']} selected for {round(kg)} kg {stream}: {round(chosen['predicted_kwh'])} kWh expected, score {chosen['score']:.0f}/100"
    if others:
        runner = others[0]
        nearest = min(eligible, key=lambda c: c["distance_km"])
        gain = (chosen["predicted_kwh"] / runner["predicted_kwh"] - 1) * 100 if runner["predicted_kwh"] > 0 else 0
        dkm = chosen["distance_km"] - runner["distance_km"]
        headline = (f"{chosen['label']} selected because it provides {gain:.0f}% higher predicted energy yield"
                    + (f" despite being {dkm:.0f} km farther away." if dkm > 1 else "."))
        bullets.append(f"{'+' if gain >= 0 else ''}{gain:.0f}% expected energy yield vs {runner['label']}")
        de = chosen["efficiency_pct"] - runner["efficiency_pct"]
        if abs(de) >= 1:
            bullets.append(f"{'+' if de > 0 else ''}{de:.0f} pp conversion efficiency vs {runner['label']}")
        bullets.append(f"{chosen['compatibility_pct']:.0f}% waste compatibility")
        bullets.append(f"{chosen['utilization_pct']:.0f}% current capacity utilization")
        dc = chosen["transport_cost_inr"] - runner["transport_cost_inr"]
        bullets.append(f"Only ₹{dc:,.0f} additional transport cost" if dc > 0 else f"₹{-dc:,.0f} lower transport cost")
        if chosen.get("historical_yield_kwh_per_kg"):
            bullets.append(f"Historical yield {chosen['historical_yield_kwh_per_kg']:.2f} kWh/kg across {chosen.get('n_history') or 0} batches")
        for o in others:
            delta = chosen["predicted_kwh"] - o["predicted_kwh"]
            comparisons.append({"facility": o["label"], "energy_delta_kwh": round(delta, 1), "distance_delta_km": round(chosen["distance_km"] - o["distance_km"], 1),
                                "cost_delta_inr": round(chosen["transport_cost_inr"] - o["transport_cost_inr"]), "score_delta": round(chosen["score"] - o["score"], 1)})
        if nearest is not chosen:
            extra = chosen["predicted_kwh"] - nearest["predicted_kwh"]
            comparisons_text = (f"Although {chosen['label']} is {chosen['distance_km'] - nearest['distance_km']:.0f} km farther than {nearest['label']}, "
                                f"its higher conversion efficiency produces approximately {extra:.0f} kWh additional useful energy.")
        else:
            comparisons_text = f"{chosen['label']} is also the nearest eligible facility."
        net = chosen["predicted_kwh"] - runner["predicted_kwh"]
        return {"headline": headline, "bullets": bullets, "comparisons": comparisons, "vs_nearest": comparisons_text,
                "net_energy_advantage_kwh": round(net, 1), "runner_up": runner["label"]}
    return {"headline": headline, "bullets": ["Only eligible facility for this stream"], "comparisons": [], "vs_nearest": "", "net_energy_advantage_kwh": None, "runner_up": None}
