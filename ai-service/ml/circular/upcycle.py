"""Upcycling partner matching.

For a lot of upcycle-grade items (textiles, glass jars, PET bottles, ...) rank every
partner that accepts the category by:

  value     what the partner pays x expected accepted kg - transport cost
  carbon    CO2e avoided by reuse/upcycling of the accepted kg - transport CO2
  accept    learned acceptance rate (Beta posterior over the partner's receipts)
  distance  road distance from the hub

and compare the best match against the fallback pathway (recycling or WtE), so the
operator sees why upcycling wins, or doesn't.

Emission factors and prices are ASSUMPTIONS (literature / Delhi scrap-market ranges),
listed in docs/CIRCULAR.md. The acceptance rate is the part that is learned: every
partner receipt (accepted vs rejected kg) updates it.
"""
from __future__ import annotations

# kg CO2e avoided per kg, by end-of-life route (conservative: partial displacement of new product)
EF_UPCYCLE = {"textile": 8.0, "glass_container": 0.6, "pet_bottle": 1.8, "hdpe_container": 1.5, "cardboard": 0.9}
EF_RECYCLE = {"textile": 3.0, "glass_container": 0.3, "pet_bottle": 1.4, "hdpe_container": 1.2, "cardboard": 0.7}
# Default end-of-life if not upcycled: what Delhi does with it today
FALLBACK = {
    "textile": ("WtE (incineration)", 0.0, 0.2),       # (route, INR/kg, kg CO2e avoided per kg)
    "glass_container": ("Recycling (cullet)", 1.5, EF_RECYCLE["glass_container"]),
    "pet_bottle": ("Recycling (flakes)", 22.0, EF_RECYCLE["pet_bottle"]),
    "hdpe_container": ("Recycling (granules)", 22.0, EF_RECYCLE["hdpe_container"]),
    "cardboard": ("Recycling (paper mill)", 9.0, EF_RECYCLE["cardboard"]),
}
ACCEPT_PRIOR = 0.85
ACCEPT_STRENGTH = 8.0  # prior worth 8 "receipts" of 50 kg
KG_PER_OBS = 50.0
WEIGHTS = {"value": 0.40, "carbon": 0.35, "acceptance": 0.15, "distance": 0.10}


def acceptance_rate(received_kg: float, accepted_kg: float) -> float:
    a = ACCEPT_STRENGTH * ACCEPT_PRIOR + accepted_kg / KG_PER_OBS
    b = ACCEPT_STRENGTH * (1 - ACCEPT_PRIOR) + max(0.0, received_kg - accepted_kg) / KG_PER_OBS
    return a / (a + b)


def _norm(vals: list[float]) -> list[float]:
    lo, hi = min(vals), max(vals)
    return [0.5 if hi - lo < 1e-9 else (v - lo) / (hi - lo) for v in vals]


def match(category: str, kg: float, partners: list[dict]) -> dict:
    if category not in EF_UPCYCLE:
        raise ValueError(f"unknown upcycle category {category}")
    rows = []
    for p in partners:
        price = (p.get("prices") or {}).get(category)
        acc = acceptance_rate(p.get("received_kg", 0.0), p.get("accepted_kg", 0.0))
        free = p["capacity_kg_week"] - p.get("load_kg_week", 0.0)
        reason = None
        if price is None:
            reason = "does not accept this category"
        elif p.get("status", "active") != "active":
            reason = f"partner {p.get('status')}"
        elif free < kg:
            reason = f"weekly capacity left {free:.0f} kg < {kg:.0f} kg"
        acc_kg = kg * acc
        value = acc_kg * (price or 0) - p["transport_cost_inr"]
        co2 = acc_kg * EF_UPCYCLE[category] + (kg - acc_kg) * FALLBACK[category][2] - p["transport_co2_kg"]
        rows.append({"partner_id": p["id"], "name": p["name"], "distance_km": p["distance_km"], "price_inr_per_kg": price,
                     "acceptance_rate": round(acc, 3), "expected_accepted_kg": round(acc_kg, 1), "net_value_inr": round(value, 0),
                     "co2_avoided_kg": round(co2, 1), "transport_cost_inr": p["transport_cost_inr"], "capacity_left_kg": round(free, 0),
                     "eligible": reason is None, "exclusion_reason": reason})
    elig = [r for r in rows if r["eligible"]]
    fb_route, fb_price, fb_ef = FALLBACK[category]
    fallback = {"route": fb_route, "value_inr": round(kg * fb_price, 0), "co2_avoided_kg": round(kg * fb_ef, 1)}
    factors = {"ef_upcycle": EF_UPCYCLE[category], "ef_fallback": fb_ef, "fallback_inr_per_kg": fb_price}
    if not elig:
        return {"chosen_partner_id": None, "ranking": rows, "fallback": fallback, "weights": WEIGHTS, "factors": factors, "upcycle_better": False,
                "explanation": {"headline": f"No eligible partner — send to {fb_route}", "bullets": [r["exclusion_reason"] for r in rows if r["exclusion_reason"]][:4]}}
    nv = _norm([r["net_value_inr"] for r in elig])
    nc = _norm([r["co2_avoided_kg"] for r in elig])
    nd = _norm([-r["distance_km"] for r in elig])
    for r, v, c, d in zip(elig, nv, nc, nd):
        r["score"] = round(100 * (WEIGHTS["value"] * v + WEIGHTS["carbon"] * c + WEIGHTS["acceptance"] * r["acceptance_rate"] + WEIGHTS["distance"] * d), 1)
    elig.sort(key=lambda r: -r["score"])
    best = elig[0]
    ranking = elig + [r for r in rows if not r["eligible"]]
    for i, r in enumerate(ranking):
        r["rank"] = i + 1 if r["eligible"] else None
    gain_co2 = best["co2_avoided_kg"] - fallback["co2_avoided_kg"]
    gain_val = best["net_value_inr"] - fallback["value_inr"]
    upcycle_better = gain_co2 > 0
    bullets = [
        f"{best['expected_accepted_kg']:.0f} of {kg:.0f} kg expected to be accepted (learned acceptance {best['acceptance_rate']*100:.0f}%)",
        f"{best['co2_avoided_kg']:.0f} kg CO2e avoided vs {fallback['co2_avoided_kg']:.0f} kg via {fb_route}",
        f"Net value Rs {best['net_value_inr']:,.0f} after Rs {best['transport_cost_inr']:,.0f} transport ({best['distance_km']:.1f} km)",
    ]
    if len(elig) > 1:
        bullets.append(f"Beat {elig[1]['name']} by {best['score'] - elig[1]['score']:.1f} points")
    return {
        "chosen_partner_id": best["partner_id"] if upcycle_better else None, "ranking": ranking, "fallback": fallback, "weights": WEIGHTS, "factors": factors,
        "upcycle_better": upcycle_better, "gain_vs_fallback": {"co2_kg": round(gain_co2, 1), "value_inr": round(gain_val, 0)},
        "explanation": {
            "headline": (f"Upcycle with {best['name']}: +{gain_co2:.0f} kg CO2e avoided vs {fb_route}" if upcycle_better
                         else f"Upcycling does not beat {fb_route} here — keep the default route"),
            "bullets": bullets,
        },
    }
