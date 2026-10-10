"""City-scale allocation planner (linear program, OR-Tools GLOP).

Decides how many tonnes/day of each zone's mixed MSW go to each facility.

  maximize   Σ_z,f x[z,f]·yield_f  +  Σ_z o[z]·ad_yield   −  diesel_kwh_per_tkm · Σ x[z,f]·road_km[z,f]   (net kWh/day)
  subject to Σ_f x[z,f] + o[z] = TPD_z                    (every tonne goes somewhere)
             Σ_z x[z,f] ≤ capacity_f                        (plant capacity)
             Σ_z o[z]  ≤ capacity_AD,  o[z] ≤ segregated organics of zone z
             x ≥ 0

Landfills have zero energy and no capacity limit (they are the overflow — exactly what happens today).
Yields are kWh per tonne of mixed MSW from each plant's published MW ÷ TPD.
Transport energy: a 9 t truck uses ~0.3 L diesel/km ≈ 3 kWh/km (10 kWh/L) → ≈ 0.33 kWh per tonne-km.
"""
from __future__ import annotations

DIESEL_KWH_PER_TKM = 0.33


def _evaluate(zones, facs, dist, alloc):
    """Energy, landfill tonnes and tonne-km for an allocation {(z, f): t}."""
    energy = tkm = landfill = 0.0
    by_fac = {f["code"]: 0.0 for f in facs}
    for (z, fc), t in alloc.items():
        f = next(x for x in facs if x["code"] == fc)
        energy += t * f["kwh_per_t"]
        tkm += t * dist[z][fc]
        by_fac[fc] += t
        if f["technology"] == "landfill":
            landfill += t
    return {"energy_mwh_day": round(energy / 1000, 1), "net_energy_mwh_day": round((energy - DIESEL_KWH_PER_TKM * tkm) / 1000, 1),
            "landfill_tpd": round(landfill, 0), "tonne_km_day": round(tkm, 0), "by_facility_tpd": {k: round(v, 0) for k, v in by_fac.items()}}


def current_practice(zones, facs, dist):
    """MCD's published assignment: each zone split equally over its listed destinations;
    WtE plants accept up to capacity, any excess goes to the nearest landfill (what happens in practice)."""
    alloc: dict = {}
    load = {f["code"]: 0.0 for f in facs}
    requests: list = []
    for z in zones:
        dests = [d for d in z["current_destinations"] if d in load]
        for d in dests:
            requests.append((z["name"], d, z["tpd"] / len(dests)))
    landfills = [f for f in facs if f["technology"] == "landfill"]
    for zname, d, t in requests:
        f = next(x for x in facs if x["code"] == d)
        cap = float("inf") if f["technology"] == "landfill" else f["capacity_tpd"]
        take = max(0.0, min(t, cap - load[d]))
        load[d] += take
        if take:
            alloc[(zname, d)] = alloc.get((zname, d), 0) + take
        rest = t - take
        if rest > 1e-6:
            lf = min(landfills, key=lambda x: dist[zname][x["code"]])
            alloc[(zname, lf["code"])] = alloc.get((zname, lf["code"]), 0) + rest
            load[lf["code"]] += rest
    return alloc


def optimize(zones, facs, dist, organic_share=0.4, segregation=0.57):
    from ortools.linear_solver import pywraplp

    s = pywraplp.Solver.CreateSolver("GLOP")
    mixed = [f for f in facs if f["technology"] in ("combustion", "landfill") and f["status"] == "online"]
    ads = [f for f in facs if f["technology"] == "anaerobic_digestion" and f["status"] == "online"]
    x = {(z["name"], f["code"]): s.NumVar(0, s.infinity(), f"x_{i}_{j}") for i, z in enumerate(zones) for j, f in enumerate(mixed)}
    o = {(z["name"], f["code"]): s.NumVar(0, s.infinity(), f"o_{i}_{j}") for i, z in enumerate(zones) for j, f in enumerate(ads)}
    for z in zones:
        s.Add(sum(x[z["name"], f["code"]] for f in mixed) + sum(o[z["name"], f["code"]] for f in ads) == z["tpd"])
        # only the source-segregated share of organics can go to biomethanation
        if ads:
            s.Add(sum(o[z["name"], f["code"]] for f in ads) <= z["tpd"] * organic_share * segregation)
    for f in mixed:
        if f["technology"] != "landfill":
            s.Add(sum(x[z["name"], f["code"]] for z in zones) <= f["capacity_tpd"])
    for f in ads:
        s.Add(sum(o[z["name"], f["code"]] for z in zones) <= f["capacity_tpd"])
    obj = s.Objective()
    for (zn, fc), v in {**x, **o}.items():
        f = next(q for q in facs if q["code"] == fc)
        obj.SetCoefficient(v, f["kwh_per_t"] - DIESEL_KWH_PER_TKM * dist[zn][fc])
    obj.SetMaximization()
    status = s.Solve()
    if status != pywraplp.Solver.OPTIMAL:
        raise RuntimeError("planner LP did not reach optimality")
    alloc = {k: v.solution_value() for k, v in {**x, **o}.items() if v.solution_value() > 0.5}
    return alloc


def plan(zones: list[dict], facilities: list[dict], dist: dict) -> dict:
    """zones: [{name, tpd, current_destinations: [codes]}]; facilities: [{code,label,technology,status,capacity_tpd,kwh_per_t}];
    dist: {zone_name: {facility_code: road_km}}."""
    base = current_practice(zones, facilities, dist)
    opt = optimize(zones, facilities, dist)
    rows = lambda alloc: sorted(
        [{"zone": z, "facility": fc, "label": next(f["label"] for f in facilities if f["code"] == fc), "tpd": round(t, 0), "km": round(dist[z][fc], 1)}
         for (z, fc), t in alloc.items()], key=lambda r: (r["zone"], -r["tpd"]))
    b, p = _evaluate(zones, facilities, dist, base), _evaluate(zones, facilities, dist, opt)
    return {
        "current": {**b, "allocation": rows(base)},
        "optimized": {**p, "allocation": rows(opt)},
        "delta": {
            "energy_mwh_day": round(p["energy_mwh_day"] - b["energy_mwh_day"], 1),
            "net_energy_mwh_day": round(p["net_energy_mwh_day"] - b["net_energy_mwh_day"], 1),
            "landfill_tpd": round(p["landfill_tpd"] - b["landfill_tpd"], 0),
            "tonne_km_day": round(p["tonne_km_day"] - b["tonne_km_day"], 0),
        },
        "method": "Linear program (OR-Tools GLOP): maximize electricity − diesel energy for haulage, subject to plant capacities; landfill is the overflow",
        "assumptions": {"diesel_kwh_per_tonne_km": DIESEL_KWH_PER_TKM, "organic_share": 0.4, "source_segregation": 0.57},
    }
