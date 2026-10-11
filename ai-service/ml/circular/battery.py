"""Battery second life: grade discarded batteries and combine the good ones into packs.

Discarded batteries rarely die completely: an EV or e-rickshaw pack is retired at about
70-80% state of health (SoH), and laptop or power-bank cells are often thrown away with
most of their capacity left. Combined into a new pack with a BMS, they can STORE electricity
(rooftop solar at a hub, street lights, telecom backup, e-rickshaw traction) for years.
They don't generate electricity themselves; the residual charge in a pile of old cells is
negligible.

Pipeline:
  1. grade()        safety screen + SoH / internal-resistance grade + remaining cycles
  2. design_pack()  choose S (series) from the target voltage, select matched units, then
                    split them into S parallel groups of P with OR-Tools CP-SAT so every
                    group has nearly the same capacity (a series string is limited by its
                    weakest group). Compared against random assembly to show the gain.
  3. update_fade()  telemetry from deployed packs (SoH vs cycles) updates the per-chemistry
                    fade-rate prior that grading and design use: the closed loop.

Constants are engineering ASSUMPTIONS from the second-life literature, listed in
docs/CIRCULAR.md. Fade priors are replaced by observed values as packs report back.
"""
from __future__ import annotations

import math
import random

CHEM = {
    "li_nmc": {"label": "Li-ion NMC", "cell_v": 3.65, "v_min_safe_per_cell": 2.5, "dod": 0.80, "fade": 2.5e-4, "ir_k": 90.0,
               "embodied_kg_co2_per_kwh": 75.0, "new_inr_per_kwh": 15000, "recovery": {"black mass (Ni, Co, Mn, Li)": 0.35, "copper": 0.08, "aluminium": 0.06, "steel & casing": 0.20}},
    "li_lfp": {"label": "Li-ion LFP", "cell_v": 3.2, "v_min_safe_per_cell": 2.0, "dod": 0.90, "fade": 8e-5, "ir_k": 60.0,
               "embodied_kg_co2_per_kwh": 70.0, "new_inr_per_kwh": 13000, "recovery": {"black mass (Li, Fe, P)": 0.30, "copper": 0.09, "aluminium": 0.07, "steel & casing": 0.20}},
    "lead_acid": {"label": "Lead-acid", "cell_v": 2.0, "v_min_safe_per_cell": 1.75, "dod": 0.50, "fade": 1.2e-3, "ir_k": 75.0,
                  "embodied_kg_co2_per_kwh": 30.0, "new_inr_per_kwh": 9000, "recovery": {"lead": 0.65, "polypropylene": 0.06, "acid (neutralised)": 0.15}},
}
EOL_SOH = 0.60            # second-life end of life
REPURPOSE_INR_PER_KWH = 4500  # testing, BMS, enclosure, labour
GRADE_A_SOH, GRADE_B_SOH = 0.80, 0.65

APPLICATIONS = {
    "solar_storage_48v": {"label": "Hub rooftop solar storage (48 V)", "target_v": 48.0, "min_soh": 0.65, "cycles_per_day": 1.0, "displaces_kg_co2_per_kwh": 0.71,
                          "note": "stores daytime solar for evening hub operations; displaces grid power (CEA ~0.71 kg CO2/kWh)"},
    "erickshaw_48v": {"label": "E-rickshaw traction pack (48 V)", "target_v": 48.0, "min_soh": 0.80, "cycles_per_day": 1.0, "displaces_kg_co2_per_kwh": 0.0,
                      "note": "replaces a new pack (most Delhi e-rickshaws still use lead-acid); benefit is avoided manufacturing"},
    "streetlight_12v": {"label": "Solar street light (12 V)", "target_v": 12.0, "min_soh": 0.65, "cycles_per_day": 1.0, "displaces_kg_co2_per_kwh": 0.71,
                        "note": "low current, forgiving of weaker cells"},
    "telecom_48v": {"label": "Telecom / MRF backup (48 V)", "target_v": 48.0, "min_soh": 0.80, "cycles_per_day": 0.2, "displaces_kg_co2_per_kwh": 0.80,
                    "note": "replaces diesel-genset backup (~0.8 kg CO2/kWh)"},
}


def ir_ref(chem: str, nominal_ah: float, nominal_v: float) -> float:
    """Typical new-unit internal resistance (mOhm) when the lot spec doesn't give one."""
    cells = max(1, round(nominal_v / CHEM[chem]["cell_v"]))
    return CHEM[chem]["ir_k"] / max(nominal_ah, 0.1) * cells


def grade(units: list[dict], fade_priors: dict | None = None) -> dict:
    """units: {id, chemistry, nominal_v, nominal_ah, measured_ah, ir_mohm, voltage, swelling, leakage, ir_ref_mohm?}"""
    fade_priors = fade_priors or {}
    out = []
    for u in units:
        c = CHEM[u["chemistry"]]
        cells = max(1, round(u["nominal_v"] / c["cell_v"]))
        ref = u.get("ir_ref_mohm") or ir_ref(u["chemistry"], u["nominal_ah"], u["nominal_v"])
        soh = u["measured_ah"] / u["nominal_ah"] if u["nominal_ah"] else 0.0
        irr = u["ir_mohm"] / ref if ref else 1.0
        fade = fade_priors.get(u["chemistry"], c["fade"]) * (1 + 0.6 * max(0.0, irr - 1))
        reason = None
        if u.get("swelling") or u.get("leakage"):
            g, reason = "R", "swollen or leaking: safety reject"
        elif u.get("voltage") is not None and u["voltage"] < c["v_min_safe_per_cell"] * cells:
            g, reason = "R", f"deep-discharged ({u['voltage']:.2f} V < {c['v_min_safe_per_cell'] * cells:.2f} V): internal damage risk"
        elif irr > 2.5:
            g, reason = "R", f"internal resistance {irr:.1f}x new"
        elif soh >= GRADE_A_SOH and irr <= 1.6:
            g = "A"
        elif soh >= GRADE_B_SOH and irr <= 2.0:
            g = "B"
        else:
            g, reason = "R", f"SoH {soh * 100:.0f}% below {GRADE_B_SOH * 100:.0f}%" if soh < GRADE_B_SOH else f"internal resistance {irr:.1f}x new"
        rul = max(0.0, (soh - EOL_SOH) / fade) if g != "R" else 0.0
        out.append({"id": u["id"], "grade": g, "soh": round(soh, 4), "ir_ratio": round(irr, 3), "fade_per_cycle": round(fade, 7),
                    "remaining_cycles": int(rul), "reason": reason or ("stationary or traction second life" if g == "A" else "low-power second life")})
    counts = {k: sum(1 for o in out if o["grade"] == k) for k in "ABR"}
    return {"units": out, "counts": counts,
            "policy": {"A": f"SoH >= {GRADE_A_SOH:.0%}, IR <= 1.6x new", "B": f"SoH >= {GRADE_B_SOH:.0%}, IR <= 2.0x new",
                       "R": "recycle: below B, or swollen / leaking / deep-discharged / IR > 2.5x", "eol_soh": EOL_SOH}}


def _groups_stats(groups: list[list[dict]]) -> dict:
    sums = [sum(u["measured_ah"] for u in g) for g in groups]
    mean = sum(sums) / len(sums)
    return {"sums": sums, "min": min(sums), "max": max(sums), "imbalance_pct": 100 * (max(sums) - min(sums)) / mean if mean else 0.0}


def _greedy(units: list[dict], S: int, P: int) -> list[list[dict]]:
    groups: list[list[dict]] = [[] for _ in range(S)]
    sums = [0.0] * S
    for u in sorted(units, key=lambda x: -x["measured_ah"]):
        g = min((i for i in range(S) if len(groups[i]) < P), key=lambda i: sums[i])
        groups[g].append(u)
        sums[g] += u["measured_ah"]
    return groups


def _cpsat(units: list[dict], S: int, P: int, hint: list[list[dict]], time_s: float) -> tuple[list[list[dict]], str]:
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return hint, "greedy (OR-Tools unavailable)"
    caps = [int(round(u["measured_ah"] * 1000)) for u in units]  # mAh integers
    n = len(units)
    m = cp_model.CpModel()
    x = [[m.NewBoolVar(f"x{i}_{g}") for g in range(S)] for i in range(n)]
    for i in range(n):
        m.AddExactlyOne(x[i])
    sums = []
    for g in range(S):
        m.Add(sum(x[i][g] for i in range(n)) == P)
        s = m.NewIntVar(0, sum(caps), f"s{g}")
        m.Add(s == sum(caps[i] * x[i][g] for i in range(n)))
        sums.append(s)
    lo = m.NewIntVar(0, sum(caps), "lo")
    hi = m.NewIntVar(0, sum(caps), "hi")
    m.AddMinEquality(lo, sums)
    m.AddMaxEquality(hi, sums)
    for g in range(S - 1):  # symmetry breaking
        m.Add(sums[g] <= sums[g + 1])
    # maximise the weakest group first (it sets pack Ah), then minimise spread
    m.Minimize((hi - lo) - 2 * lo)
    idx = {id(u): i for i, u in enumerate(units)}
    order = sorted(range(S), key=lambda g: sum(u["measured_ah"] for u in hint[g]))
    for rank, g in enumerate(order):
        for u in hint[g]:
            for gg in range(S):
                m.AddHint(x[idx[id(u)]][gg], 1 if gg == rank else 0)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_s
    solver.parameters.num_workers = 8
    st = solver.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return hint, "greedy (CP-SAT found no solution in time)"
    groups = [[units[i] for i in range(n) if solver.Value(x[i][g])] for g in range(S)]
    return groups, "OR-Tools CP-SAT (" + ("optimal" if st == cp_model.OPTIMAL else "best found in time limit") + ")"


def design_pack(units: list[dict], application: str, target_kwh: float | None = None, fade_priors: dict | None = None, time_s: float = 3.0) -> dict:
    """units: graded units {id, chemistry, nominal_v, nominal_ah, measured_ah, ir_mohm, soh, grade, fade_per_cycle}, one chemistry."""
    app = APPLICATIONS[application]
    if not units:
        raise ValueError("no graded units available")
    chem = units[0]["chemistry"]
    if any(u["chemistry"] != chem for u in units):
        raise ValueError("a pack must use a single chemistry")
    c = CHEM[chem]
    unit_v = units[0]["nominal_v"]
    if any(abs(u["nominal_v"] - unit_v) > 0.05 for u in units):
        raise ValueError("units must share one nominal voltage")
    S = max(1, round(app["target_v"] / unit_v))
    pool = [u for u in units if u["grade"] in ("A", "B") and u["soh"] >= app["min_soh"]]
    excluded = {"below_application_soh": sum(1 for u in units if u["grade"] in ("A", "B") and u["soh"] < app["min_soh"]), "ir_outliers": 0}
    if pool:
        irs = sorted(u["ir_mohm"] for u in pool)
        med = irs[len(irs) // 2]
        keep = [u for u in pool if u["ir_mohm"] <= 1.5 * med]  # parallel cells must share current evenly
        excluded["ir_outliers"] = len(pool) - len(keep)
        pool = keep
    if len(pool) < S:
        raise ValueError(f"{app['label']} needs at least {S} units at SoH >= {app['min_soh']:.0%} (have {len(pool)})")
    mean_cap = sum(u["measured_ah"] for u in pool) / len(pool)
    P_max = len(pool) // S
    P = P_max
    if target_kwh:
        need = math.ceil(target_kwh * 1000 / (S * unit_v * mean_cap * c["dod"]))
        P = max(1, min(P_max, need))
    n = S * P
    # choose the n units with the tightest capacity spread (prefer higher capacity on ties)
    srt = sorted(pool, key=lambda u: u["measured_ah"])
    best_i = min(range(len(srt) - n + 1), key=lambda i: ((srt[i + n - 1]["measured_ah"] - srt[i]["measured_ah"]), -srt[i]["measured_ah"]))
    chosen = srt[best_i:best_i + n]

    greedy = _greedy(chosen, S, P)
    groups, solver = _cpsat(chosen, S, P, greedy, time_s) if S > 1 and P > 1 else (greedy, "trivial (single group or one unit per group)")
    st = _groups_stats(groups)

    # Baseline: same pool assembled without testing/matching (random units, random groups)
    rnd = random.Random(42)
    naive_units = rnd.sample(pool, n)
    rnd.shuffle(naive_units)
    naive = _groups_stats([naive_units[g * P:(g + 1) * P] for g in range(S)])

    def energy(min_ah: float) -> float:
        return S * unit_v * min_ah / 1000

    pack_ah = st["min"]
    e_nom = energy(pack_ah)
    usable = e_nom * c["dod"]
    group_soh = [sum(u["measured_ah"] for u in g) / sum(u["nominal_ah"] for u in g) for g in groups]
    pack_soh = min(group_soh)
    fade = sum(u["fade_per_cycle"] for u in chosen) / n * (1 + 2 * st["imbalance_pct"] / 100)
    cycles = max(0.0, (pack_soh - EOL_SOH) / fade)
    years = cycles / app["cycles_per_day"] / 365
    lifetime_kwh = usable * cycles * ((pack_soh + EOL_SOH) / 2) / pack_soh if pack_soh else 0.0
    mfg_co2 = usable * c["embodied_kg_co2_per_kwh"]
    op_co2 = lifetime_kwh * app["displaces_kg_co2_per_kwh"]
    naive_usable = energy(naive["min"]) * c["dod"]
    return {
        "application": application, "application_label": app["label"], "application_note": app["note"],
        "chemistry": chem, "chemistry_label": c["label"], "config": f"{S}S{P}P", "series": S, "parallel": P, "units_used": n,
        "unit_v": unit_v, "nominal_v": round(S * unit_v, 1), "capacity_ah": round(pack_ah, 2),
        "energy_kwh": round(e_nom, 3), "usable_kwh": round(usable, 3), "dod": c["dod"],
        "imbalance_pct": round(st["imbalance_pct"], 2), "stranded_ah": round(sum(st["sums"]) - S * st["min"], 2),
        "pack_soh": round(pack_soh, 4), "fade_per_cycle": round(fade, 7), "predicted_cycles": int(cycles), "predicted_years": round(years, 1),
        "lifetime_mwh": round(lifetime_kwh / 1000, 2),
        "co2_avoided_kg": {"manufacturing": round(mfg_co2, 0), "operation": round(op_co2, 0), "total": round(mfg_co2 + op_co2, 0)},
        "economics_inr": {"new_pack": round(usable * c["new_inr_per_kwh"], 0), "second_life": round(usable * REPURPOSE_INR_PER_KWH, 0),
                          "saving": round(usable * (c["new_inr_per_kwh"] - REPURPOSE_INR_PER_KWH), 0)},
        "solver": solver,
        "groups": [{"group": i + 1, "unit_ids": [u["id"] for u in g], "ah": round(sum(u["measured_ah"] for u in g), 3),
                    "soh": round(group_soh[i], 4), "ir_avg_mohm": round(sum(u["ir_mohm"] for u in g) / len(g), 2)} for i, g in enumerate(groups)],
        "baseline_random": {"imbalance_pct": round(naive["imbalance_pct"], 2), "capacity_ah": round(naive["min"], 2), "usable_kwh": round(naive_usable, 3)},
        "gain_vs_random": {"usable_kwh": round(usable - naive_usable, 3), "pct": round(100 * (usable - naive_usable) / naive_usable, 1) if naive_usable else None},
        "excluded": excluded, "pool_size": len(pool),
        "assembly": [
            f"Charge every unit to the same voltage before joining each parallel group ({P} per group)",
            f"BMS with {S} cell-group voltage channels and passive/active balancing",
            "Fuse each unit in a parallel group; torque/spot-weld per unit spec",
            f"Capacity test the finished pack and log it: telemetry closes the loop on the fade prediction ({fade:.2e}/cycle)",
        ],
    }


def update_fade(chemistry: str, prior_fade: float, prior_n: float, packs: list[dict]) -> dict:
    """Least-squares fade per cycle from each pack's (cycles, soh) history, pooled into the prior.

    packs: {id, predicted_fade, points: [{cycles, soh}]}; each pack's weight = observed cycles / 100."""
    per_pack = []
    num = prior_fade * prior_n
    den = prior_n
    for p in packs:
        pts = p["points"]
        if len(pts) < 3:
            continue
        x0, y0 = pts[0]["cycles"], pts[0]["soh"]
        xs = [q["cycles"] - x0 for q in pts]
        ys = [q["soh"] - y0 for q in pts]
        sxx = sum(x * x for x in xs)
        if sxx <= 0:
            continue
        slope = sum(x * y for x, y in zip(xs, ys)) / sxx  # through the first point
        obs = max(1e-7, -slope)
        w = xs[-1] / 100
        num += obs * w
        den += w
        per_pack.append({"id": p["id"], "observed_fade": round(obs, 8), "predicted_fade": p.get("predicted_fade"), "cycles": round(xs[-1], 1),
                         "error_pct": round(100 * (obs - p["predicted_fade"]) / p["predicted_fade"], 1) if p.get("predicted_fade") else None})
    post = num / den
    return {"chemistry": chemistry, "prior_fade": prior_fade, "posterior_fade": round(post, 8), "posterior_n": round(den, 2),
            "change_pct": round(100 * (post - prior_fade) / prior_fade, 1), "packs": per_pack}


def recovery(chemistry: str, kg: float) -> list[dict]:
    return [{"material": k, "kg": round(kg * v, 1)} for k, v in CHEM[chemistry]["recovery"].items()]
