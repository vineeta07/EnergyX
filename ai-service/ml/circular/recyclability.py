"""Recyclable vs non-recyclable split, and upcycling potential, for a hub load.

Every one of the vision model's 30 item classes carries a recyclability label that
reflects Indian practice (what MRFs and the informal kabadi chain actually buy), not
just the resin code:

* PET/HDPE bottles, cans, cardboard, paper, glass  -> recyclable
* thin carry bags, trash bags, cup lids, cutlery,   -> non-recyclable in practice
  straws, styrofoam                                    (low value / SUP ban, July 2022)
* PE-lined paper cups                                -> non-recyclable (lining)
* food, coffee grounds, tea bags, eggshells          -> biodegradable: not recyclable,
                                                        but compost / biomethanation feed

Load level: each stream's recyclable share has a Beta prior (assumed Delhi values
below). Each usable photo is one randomly sampled item; its class probabilities add
soft recyclable / non-recyclable counts to its stream. The posterior mean is the share.
Without photos the prior is returned unchanged and labelled as such.
"""
from __future__ import annotations

# Item class -> (recyclable, upcycle category or None, short reason)
ITEMS: dict[str, tuple[bool, str | None, str]] = {
    "aerosol_cans": (True, None, "steel/aluminium scrap after depressurising"),
    "aluminum_food_cans": (True, None, "aluminium scrap, high value"),
    "aluminum_soda_cans": (True, None, "aluminium scrap, high value"),
    "cardboard_boxes": (True, "cardboard", "OCC — paper mills; intact boxes reusable"),
    "cardboard_packaging": (True, None, "OCC — paper mills"),
    "clothing": (False, "textile", "not taken by MRFs; reuse / upcycling / shoddy"),
    "coffee_grounds": (False, None, "biodegradable — compost or biomethanation"),
    "disposable_plastic_cutlery": (False, None, "single-use plastic (banned 2022), no buyer"),
    "eggshells": (False, None, "biodegradable — compost"),
    "food_waste": (False, None, "biodegradable — compost or biomethanation"),
    "glass_beverage_bottles": (True, "glass_container", "cullet; intact bottles reusable"),
    "glass_cosmetic_containers": (True, "glass_container", "cullet; intact jars reusable"),
    "glass_food_jars": (True, "glass_container", "cullet; intact jars reusable"),
    "magazines": (True, None, "mixed paper"),
    "newspaper": (True, None, "old newsprint, high value"),
    "office_paper": (True, None, "white record paper, high value"),
    "paper_cups": (False, None, "PE lining — not accepted by paper mills"),
    "plastic_cup_lids": (False, None, "PS/PP lids, too small and dirty to sort"),
    "plastic_detergent_bottles": (True, "hdpe_container", "HDPE, recyclable; containers reusable"),
    "plastic_food_containers": (True, None, "PP, recyclable when clean"),
    "plastic_shopping_bags": (False, None, "thin film — low value, usually burned or landfilled"),
    "plastic_soda_bottles": (True, "pet_bottle", "PET, high value; upcycled into fibre / products"),
    "plastic_straws": (False, None, "single-use plastic (banned 2022)"),
    "plastic_trash_bags": (False, None, "contaminated film"),
    "plastic_water_bottles": (True, "pet_bottle", "PET, high value; upcycled into fibre / products"),
    "shoes": (False, "textile", "mixed materials — reuse / upcycling only"),
    "steel_food_cans": (True, None, "steel scrap"),
    "styrofoam_cups": (False, None, "EPS — no recycling chain in Delhi"),
    "styrofoam_food_containers": (False, None, "EPS — no recycling chain in Delhi"),
    "tea_bags": (False, None, "biodegradable (with plastic mesh traces)"),
}
BIODEGRADABLE = {"coffee_grounds", "eggshells", "food_waste", "tea_bags"}

# Prior recyclable share of each WattCycle stream (ASSUMPTIONS for Delhi mixed MSW, documented
# in docs/CIRCULAR.md): organic is biodegradable; mixed plastic is roughly half film/multilayer;
# paper loses the soiled / laminated part; metal is nearly all saleable; `other` is mostly inert,
# with some glass.
PRIOR_SHARE = {"organic": 0.0, "plastic": 0.45, "paper": 0.70, "metal": 0.95, "other": 0.15}
PRIOR_STRENGTH = 6.0  # the prior is worth this many sampled items per stream

# Upcycling: (prior share of the whole load in this category, share that is upcycle-grade:
# clean and intact). Delhi MSW has ~3% textiles, ~1% glass; PET bottles are mostly picked
# by the informal sector before the hub. ASSUMPTIONS, refined by photos and partner feedback.
UPCYCLE = {
    "textile": {"label": "Textiles & shoes", "prior_frac": 0.03, "grade_rate": 0.30},
    "glass_container": {"label": "Glass jars & bottles", "prior_frac": 0.010, "grade_rate": 0.50},
    "pet_bottle": {"label": "PET bottles", "prior_frac": 0.006, "grade_rate": 0.60},
    "hdpe_container": {"label": "HDPE containers", "prior_frac": 0.004, "grade_rate": 0.50},
    "cardboard": {"label": "Cardboard boxes", "prior_frac": 0.020, "grade_rate": 0.35},
}
UPCYCLE_PRIOR_ITEMS = 10.0

VISION_TO_STREAM = {"glass": "other", "textile": "other"}


def item_label(cls: str) -> dict:
    rec, up, reason = ITEMS[cls]
    return {"recyclable": rec, "biodegradable": cls in BIODEGRADABLE, "upcycle": up, "reason": reason}


def photo_recyclability(probs_by_class: dict[str, float]) -> dict:
    """Per-photo P(recyclable) and P(upcyclable category)."""
    p_rec = sum(p for c, p in probs_by_class.items() if ITEMS[c][0])
    p_bio = sum(p for c, p in probs_by_class.items() if c in BIODEGRADABLE)
    up: dict[str, float] = {}
    for c, p in probs_by_class.items():
        cat = ITEMS[c][1]
        if cat:
            up[cat] = up.get(cat, 0.0) + p
    return {"p_recyclable": round(p_rec, 4), "p_biodegradable": round(p_bio, 4), "recyclable": p_rec >= 0.5,
            "upcycle": {k: round(v, 4) for k, v in up.items()}}


def estimate(composition: dict[str, float], total_kg: float, photos: list[dict] | None = None) -> dict:
    """Recyclable / non-recyclable kg for the load, per stream, plus upcycling potential.

    `photos` are vision results that carry `class_probs` (item -> p) and `weight`
    (0, 0.5 or 1 from the confidence policy)."""
    from ml.inference.vision import STREAM_OF

    photos = [p for p in (photos or []) if p.get("weight", 0) > 0]
    rec_counts = {s: PRIOR_STRENGTH * PRIOR_SHARE[s] for s in PRIOR_SHARE}
    non_counts = {s: PRIOR_STRENGTH * (1 - PRIOR_SHARE[s]) for s in PRIOR_SHARE}
    evidence = {s: 0.0 for s in PRIOR_SHARE}
    for p in photos:
        w = p["weight"]
        for c, pc in p["class_probs"].items():
            s = STREAM_OF[c]
            s = VISION_TO_STREAM.get(s, s)
            if s == "organic":
                continue  # organics are biodegradable by definition; no share to learn
            if ITEMS[c][0]:
                rec_counts[s] += w * pc
            else:
                non_counts[s] += w * pc
            evidence[s] += w * pc

    by_stream = []
    rec_kg = non_kg = bio_kg = 0.0
    for s, frac in composition.items():
        kg = total_kg * frac
        share = 0.0 if s == "organic" else rec_counts[s] / (rec_counts[s] + non_counts[s])
        r = kg * share
        rec_kg += r
        non_kg += kg - r
        if s == "organic":
            bio_kg += kg
        by_stream.append({"stream": s, "kg": round(kg, 1), "recyclable_share": round(share, 4), "recyclable_kg": round(r, 1),
                          "non_recyclable_kg": round(kg - r, 1), "evidence_items": round(evidence.get(s, 0.0), 2),
                          "basis": "biodegradable" if s == "organic" else ("prior + photos" if evidence.get(s, 0) > 0 else "prior (assumed)")})

    # Upcycling potential
    used = sum(p["weight"] for p in photos)
    upcycle = []
    for cat, u in UPCYCLE.items():
        seen = sum(p["weight"] * sum(pc for c, pc in p["class_probs"].items() if ITEMS[c][1] == cat) for p in photos)
        frac = (UPCYCLE_PRIOR_ITEMS * u["prior_frac"] + seen) / (UPCYCLE_PRIOR_ITEMS + used)
        kg = total_kg * frac * u["grade_rate"]
        upcycle.append({"category": cat, "label": u["label"], "share_of_load": round(frac, 4), "grade_rate": u["grade_rate"],
                        "upcyclable_kg": round(kg, 1), "photo_items": round(seen, 2), "basis": "prior + photos" if seen > 0 else "prior (assumed)"})
    upcycle.sort(key=lambda x: -x["upcyclable_kg"])
    tot = max(total_kg, 1e-9)
    return {
        "recyclable_kg": round(rec_kg, 1), "non_recyclable_kg": round(non_kg, 1), "biodegradable_kg": round(bio_kg, 1),
        "recyclable_pct": round(100 * rec_kg / tot, 1), "non_recyclable_pct": round(100 * non_kg / tot, 1),
        "biodegradable_pct": round(100 * bio_kg / tot, 1),
        "by_stream": by_stream, "upcycling": upcycle,
        "method": f"Beta prior per stream + {len(photos)} usable photo(s)" if photos else "stream priors only (add photos to measure)",
    }
