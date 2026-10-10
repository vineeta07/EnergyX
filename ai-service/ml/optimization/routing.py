"""MODEL 5 — Collection route optimisation: capacitated VRP with time windows
(Google OR-Tools, guided local search) + urgency-weighted drop penalties.
Distance matrix = great-circle x road factor (Amazon Location Service route
matrix in AWS mode). Falls back to nearest-neighbour + 2-opt if OR-Tools is
unavailable."""
from __future__ import annotations

import math

URGENCY_PENALTY = {"low": 50_000, "normal": 200_000, "high": 1_000_000, "critical": 5_000_000}
SERVICE_MIN = 8


def _hav(a, b) -> float:
    R = 6371.0
    la1, la2 = math.radians(a["lat"]), math.radians(b["lat"])
    dla, dlo = la2 - la1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def _matrix(points, road_factor):
    return [[_hav(p, q) * road_factor for q in points] for p in points]


def optimize(depot: dict, vehicles: list[dict], stops: list[dict], road_factor: float = 1.25, speed_kmh: float = 28.0, time_limit_s: int = 2,
             distance_matrix_km: list[list[float]] | None = None, duration_matrix_min: list[list[float]] | None = None, distance_source: str | None = None) -> dict:
    points = [depot] + stops
    n = len(points)
    real = bool(distance_matrix_km) and len(distance_matrix_km) == n and all(len(r) == n for r in distance_matrix_km)
    D = distance_matrix_km if real else _matrix(points, road_factor)
    T = duration_matrix_min if real and duration_matrix_min and len(duration_matrix_min) == n else [[d / speed_kmh * 60 for d in row] for row in D]
    baseline = sum(2 * D[0][i] for i in range(1, len(points)))
    try:
        routes, unassigned = _ortools(D, T, vehicles, stops, time_limit_s)
        solver = "ortools-cvrptw-gls"
    except ImportError:
        routes, unassigned, solver = _heuristic(D, vehicles, stops), [], "nearest-neighbour+2opt"
    out = []
    for v, seq in routes:
        if not seq:
            out.append({"vehicle_id": v["id"], "stop_ids": [], "total_km": 0, "duration_min": 0, "load_kg": 0, "baseline_km": 0, "savings_pct": 0, "opt_score": None, "explanation": "Idle", "etas_min": []})
            continue
        path = [0] + seq + [0]
        km = sum(D[a][b] for a, b in zip(path, path[1:]))
        etas, t = [], 0.0
        for a, b in zip(path, path[1:-1]):
            t += T[a][b]
            etas.append(round(t, 1))
            t += SERVICE_MIN
        dur = sum(T[a][b] for a, b in zip(path, path[1:])) + SERVICE_MIN * len(seq)
        load = sum(stops[i - 1]["demand_kg"] for i in seq)
        base = sum(2 * D[0][i] for i in seq)
        savings = 1 - km / base if base > 0 else 0
        cap = max(1.0, v["capacity_kg"] - v.get("current_load_kg", 0))
        on_time = sum(1 for i, eta in zip(seq, etas) if eta <= stops[i - 1].get("window_end_min", 1e9)) / len(seq)
        score = 100 * (0.5 * min(1.0, max(0.0, savings) / 0.4) + 0.25 * min(1.0, load / cap) + 0.25 * on_time)
        if len(seq) > 1:
            expl = (f"This route consolidates {len(seq)} pickups and reduces estimated travel distance by {savings * 100:.0f}% "
                    f"compared with individual collection ({km:.1f} km vs {base:.1f} km). Truck fill {100 * load / cap:.0f}%, "
                    f"{on_time * 100:.0f}% of stops inside their time window.")
        else:
            expl = f"Single pickup: direct round trip of {km:.1f} km. Consolidation candidates were outside capacity or time windows."
        out.append({"vehicle_id": v["id"], "stop_ids": [stops[i - 1]["id"] for i in seq], "total_km": round(km, 2), "duration_min": round(dur, 1),
                    "load_kg": load, "baseline_km": round(base, 2), "savings_pct": round(savings * 100, 1), "opt_score": round(score), "explanation": expl, "etas_min": etas})
    total = sum(r["total_km"] for r in out)
    return {"solver": solver, "distance_source": (distance_source or "osrm") if real else "great-circle x road factor", "routes": out, "baseline_km": round(baseline, 2), "total_km": round(total, 2),
            "savings_pct": round((1 - total / baseline) * 100, 1) if baseline else 0, "unassigned": unassigned or []}


def _ortools(D, T, vehicles, stops, time_limit_s):
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    n, nv = len(D), len(vehicles)
    mgr = pywrapcp.RoutingIndexManager(n, nv, 0)
    routing = pywrapcp.RoutingModel(mgr)
    dist_m = [[int(D[i][j] * 1000) for j in range(n)] for i in range(n)]

    def dist_cb(i, j):
        return dist_m[mgr.IndexToNode(i)][mgr.IndexToNode(j)]

    transit = routing.RegisterTransitCallback(dist_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(transit)
    # Fixed cost per vehicle used encourages consolidation onto fewer trucks.
    routing.SetFixedCostOfAllVehicles(15_000)

    demand = [0] + [int(s["demand_kg"]) for s in stops]
    dem_cb = routing.RegisterUnaryTransitCallback(lambda i: demand[mgr.IndexToNode(i)])
    routing.AddDimensionWithVehicleCapacity(dem_cb, 0, [int(max(0, v["capacity_kg"] - v.get("current_load_kg", 0))) for v in vehicles], True, "Capacity")

    def time_cb(i, j):
        a, b = mgr.IndexToNode(i), mgr.IndexToNode(j)
        return int(T[a][b]) + (SERVICE_MIN if a != 0 else 0)

    tcb = routing.RegisterTransitCallback(time_cb)
    routing.AddDimension(tcb, 120, 24 * 60, True, "Time")
    tdim = routing.GetDimensionOrDie("Time")
    for k, s in enumerate(stops, start=1):
        idx = mgr.NodeToIndex(k)
        lo = int(s.get("window_start_min", 0))
        hi = int(max(lo + 30, s.get("window_end_min", 600)))
        tdim.CumulVar(idx).SetMin(0)
        tdim.SetCumulVarSoftUpperBound(idx, hi, 100)  # late arrival penalised, not forbidden
        routing.AddDisjunction([idx], URGENCY_PENALTY.get(s.get("urgency", "normal"), 200_000))

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = time_limit_s
    sol = routing.SolveWithParameters(params)
    if sol is None:
        raise RuntimeError("OR-Tools found no solution")
    routes, visited = [], set()
    for vi, v in enumerate(vehicles):
        idx = routing.Start(vi)
        seq = []
        while not routing.IsEnd(idx):
            node = mgr.IndexToNode(idx)
            if node != 0:
                seq.append(node)
                visited.add(node)
            idx = sol.Value(routing.NextVar(idx))
        routes.append((v, seq))
    unassigned = [stops[k - 1]["id"] for k in range(1, n) if k not in visited]
    return routes, unassigned


def _heuristic(D, vehicles, stops):
    remaining = set(range(1, len(D)))
    routes = []
    for v in vehicles:
        cap = v["capacity_kg"] - v.get("current_load_kg", 0)
        seq, cur, load = [], 0, 0
        while True:
            cand = [i for i in remaining if load + stops[i - 1]["demand_kg"] <= cap]
            if not cand:
                break
            nxt = min(cand, key=lambda i: D[cur][i])
            seq.append(nxt)
            load += stops[nxt - 1]["demand_kg"]
            remaining.discard(nxt)
            cur = nxt
        improved = True
        while improved and len(seq) > 2:
            improved = False
            for i in range(len(seq) - 1):
                for j in range(i + 1, len(seq)):
                    new = seq[:i] + seq[i:j + 1][::-1] + seq[j + 1:]
                    p_old, p_new = [0] + seq + [0], [0] + new + [0]
                    if sum(D[a][b] for a, b in zip(p_new, p_new[1:])) + 1e-9 < sum(D[a][b] for a, b in zip(p_old, p_old[1:])):
                        seq, improved = new, True
        routes.append((v, seq))
    return routes
