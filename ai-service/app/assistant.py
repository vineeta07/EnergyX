"""WattCycle Intelligence — data-grounded assistant.

Every answer is built from structured tool calls against the WattCycle API
(/internal/tools/*), never from model memory. Two engines share the same tools:
  * Claude (Anthropic API) with tool use, when ANTHROPIC_API_KEY is configured
  * a deterministic intent router (offline fallback) otherwise
The response lists the tools that were called so users can audit the answer.
"""
from __future__ import annotations

import json
import os
import re

import httpx

from app.config import ASSISTANT_MODEL, BACKEND_URL, SERVICE_KEY

TOOLS = [
    {"name": "get_kpis", "description": "Network KPIs: waste available/collected/in processing, energy today/7d/30d, CO2 avoided (30d), active routes, prediction accuracy, open alerts.",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_facility_decisions", "description": "Most recent explainable AI facility-selection decisions (inputs, ranking of all facilities with scores, explanation, weights). Optionally filter by chosen facility name, e.g. 'Tehkhand'.",
     "input_schema": {"type": "object", "properties": {"facility": {"type": "string", "description": "Facility name fragment or code, e.g. 'Tehkhand' or 'WTE-TKD'"}}, "additionalProperties": False}},
    {"name": "get_energy_generation", "description": "Energy generated (kWh) and input waste (kg) grouped by stream and facility over a period.",
     "input_schema": {"type": "object", "properties": {"days": {"type": "integer", "minimum": 1, "maximum": 365}, "stream": {"type": "string", "enum": ["organic", "plastic", "paper", "other"]}}, "additionalProperties": False}},
    {"name": "get_co2_avoided", "description": "CO2 avoided over a period: grid displacement + landfill methane avoided − transport emissions, with emission factors.",
     "input_schema": {"type": "object", "properties": {"days": {"type": "integer", "minimum": 1, "maximum": 365}}, "additionalProperties": False}},
    {"name": "get_facility_capacity", "description": "All facilities with technology, capacity (t/day), utilization, available t/day, efficiency, status and accepted streams.",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_source_priority", "description": "Waste sources ranked by pickup priority (estimated storage fill, urgency, energy value, distance to hub).",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_routes", "description": "Recent collection/dispatch routes with km, baseline km (individual trips), truck utilization, km per pickup, CO2, cost and optimisation score.",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_models", "description": "Active ML model versions with evaluation metrics.",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
]

ENDPOINT = {
    "get_kpis": ("/internal/tools/kpis", []),
    "get_facility_decisions": ("/internal/tools/decisions", ["facility"]),
    "get_energy_generation": ("/internal/tools/energy", ["days", "stream"]),
    "get_co2_avoided": ("/internal/tools/co2", ["days"]),
    "get_facility_capacity": ("/internal/tools/facilities", []),
    "get_source_priority": ("/internal/tools/source-priority", []),
    "get_routes": ("/internal/tools/routes", []),
    "get_models": ("/internal/tools/models", []),
}


def call_tool(name: str, args: dict):
    if name not in ENDPOINT:
        raise ValueError(f"unknown tool {name}")
    path, allowed = ENDPOINT[name]
    params = {k: v for k, v in (args or {}).items() if k in allowed and v is not None}
    r = httpx.get(f"{BACKEND_URL}{path}", params=params, headers={"x-service-key": SERVICE_KEY}, timeout=20)
    r.raise_for_status()
    return r.json()


SYSTEM = """You are WattCycle Intelligence, the operations assistant for a waste-to-energy optimisation network in Delhi (real MCD zones and real Delhi facilities).
Answer ONLY from tool results — call tools for every factual claim about the network (numbers, facilities, decisions, routes).
If the tools do not contain the answer, say so plainly. Never invent figures. Zones, facilities and capacities are real published Delhi data; daily tonnages, truck loads and meter readings are simulated around those published averages. Say so when quoting totals.
Be concise: lead with the answer, then 2–5 short supporting bullets with the key numbers. Use kWh, kg / t, ₹ and km. Format with Markdown."""


def chat(messages: list[dict], user: dict) -> dict:
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            return _claude(messages, user)
        except Exception as e:  # never leave the user without an answer
            fb = _rules(messages)
            fb["notice"] = f"Claude unavailable ({type(e).__name__}); answered by the offline data router."
            return fb
    return _rules(messages)


def _claude(messages: list[dict], user: dict) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    convo = [{"role": m["role"], "content": m["content"]} for m in messages]
    used = []
    system = SYSTEM + f"\nThe user is {user.get('name')} (role: {user.get('role')})."
    for _ in range(6):
        resp = client.beta.messages.create(
            model=ASSISTANT_MODEL,
            max_tokens=4000,
            system=system,
            tools=TOOLS,
            messages=convo,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if resp.stop_reason == "refusal":
            return {"answer": "I can't help with that request.", "tools": used, "engine": "claude"}
        if resp.stop_reason != "tool_use":
            text = "".join(b.text for b in resp.content if b.type == "text")
            return {"answer": text, "tools": used, "engine": f"claude ({resp.model})"}
        convo.append({"role": "assistant", "content": resp.content})
        results = []
        for b in resp.content:
            if b.type != "tool_use":
                continue
            try:
                data = call_tool(b.name, b.input)
                used.append({"name": b.name, "input": b.input})
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(data, default=str)[:30000]})
            except Exception as e:
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": f"error: {e}", "is_error": True})
        convo.append({"role": "user", "content": results})
    return {"answer": "I could not complete that within the tool-call budget.", "tools": used, "engine": "claude"}


# ------------------------------------------------------------------ offline deterministic router
def _days(q: str, default: int) -> int:
    if "today" in q:
        return 1
    if "week" in q:
        return 7
    if "month" in q:
        return 30
    m = re.search(r"(\d+)\s*day", q)
    return int(m.group(1)) if m else default


def _fmt(n, unit=""):
    if n is None:
        return "—"
    return f"{n:,.0f}{unit}"


def _rules(messages: list[dict]) -> dict:
    q = messages[-1]["content"].lower()
    used = []

    def t(name, **args):
        used.append({"name": name, "input": args})
        return call_tool(name, args)

    if "why" in q and ("facility" in q or "select" in q or "choose" in q or "chose" in q):
        m = re.search(r"\b(okhla|tehkhand|ghazipur|bawana|bhalswa|ghogha)\b", q)
        ds = t("get_facility_decisions", facility=m.group(1).upper() if m else None)
        if not ds:
            ans = "There is no facility-selection decision on record yet" + (f" for {m.group(1).title()}" if m else "") + ". Run the demo or analyze a shipment at the hub."
        else:
            d = ds[0]
            ex = d["explanation"]
            rk = sorted([r for r in d["ranking"] if r["eligible"]], key=lambda r: -r["score"])
            table = "\n".join(f"| {r['label']} | {r['distance_km']:.0f} km | {r['predicted_kwh']:.0f} kWh | {r['efficiency_pct']:.0f}% | ₹{r['transport_cost_inr']:,.0f} | **{r['score']:.0f}** |" for r in rk)
            ans = (f"**{d['code']} — {d['subject']}**\n\n{ex['headline']}\n\n" + "\n".join(f"- {b}" for b in ex.get("bullets", []))
                   + (f"\n\n{ex['vs_nearest']}" if ex.get("vs_nearest") else "")
                   + f"\n\n| Facility | Distance | Predicted | Efficiency | Transport | Score |\n|---|---|---|---|---|---|\n{table}"
                   + f"\n\nScore = weighted utility (energy {d['weights']['energy']:.2f}, efficiency {d['weights']['efficiency']:.2f}, compatibility {d['weights']['compatibility']:.2f}, capacity {d['weights']['capacity']:.2f}, − cost {d['weights']['transport_cost']:.2f}, − carbon {d['weights']['carbon']:.2f}, − distance {d['weights']['distance']:.2f}).")
    elif "co2" in q or "carbon" in q or "emission" in q:
        days = _days(q, 7)
        c = t("get_co2_avoided", days=days)
        ans = (f"**{_fmt(c['net_avoided_kg'] / 1000 if c['net_avoided_kg'] else 0)} t CO₂e net avoided** in the last {days} day(s) (simulated network).\n\n"
               f"- Grid displacement: {_fmt(c['grid_displacement_kg'])} kg ({_fmt(c['energy_kwh'])} kWh × {c['factors']['grid_kg_per_kwh']} kg/kWh)\n"
               f"- Landfill methane avoided: {_fmt(c['landfill_methane_avoided_kg'])} kg (organic diverted × {c['factors']['landfill_kg_per_kg_organic']} kg/kg)\n"
               f"- Minus transport emissions: {_fmt(c['transport_emissions_kg'])} kg")
        if c["net_avoided_kg"] and c["net_avoided_kg"] < 1000:
            ans = ans.replace(f"**{_fmt(c['net_avoided_kg'] / 1000)} t", f"**{_fmt(c['net_avoided_kg'])} kg")
    elif "energy" in q and ("how much" in q or "generat" in q or "produce" in q):
        days = _days(q, 30)
        stream = next((s for s in ("organic", "plastic", "paper") if s in q), None)
        e = t("get_energy_generation", days=days, stream=stream)
        tot = sum(r["kwh"] for r in e["rows"])
        kg = sum(r["kg"] for r in e["rows"])
        lines = "\n".join(f"- {r['label']} ({r['technology'].replace('_', ' ')}, {r['stream']}): {_fmt(r['kwh'])} kWh from {_fmt(r['kg'])} kg" for r in e["rows"][:6])
        ans = f"**{_fmt(tot)} kWh** generated from {stream or 'all'} waste in the last {days} days ({_fmt(kg)} kg input, {tot / kg if kg else 0:.2f} kWh/kg). Simulated meter data.\n\n{lines}"
    elif "prioriti" in q or ("which" in q and "source" in q) or "pickup" in q and "today" in q:
        p = t("get_source_priority")
        def fill(s):
            return "storage full" if s["est_fill_pct"] >= 100 else f"est. {s['est_fill_pct']}% full"
        lines = "\n".join(f"{i + 1}. **{s['name']}** — {fill(s)} ({s.get('days_since_collection', '?')} d since last collection), {s['avg_daily_kg']:.0f} kg/day, {s['km_to_hub']} km to hub" + (f", open request ({s['open_request']})" if s["open_request"] else "") for i, s in enumerate(p[:5]))
        ans = f"Prioritise these sources today (storage fill × urgency × energy value ÷ distance):\n\n{lines}"
    elif "route" in q and ("ineffici" in q or "why" in q or "bad" in q or "worst" in q):
        rs = [r for r in t("get_routes") if r["kind"] == "collection"]
        if not rs:
            ans = "No collection routes on record yet."
        else:
            worst = min(rs, key=lambda r: (r["opt_score"] or 100))
            sav = (1 - worst["total_km"] / worst["baseline_km"]) * 100 if worst["baseline_km"] else 0
            reasons = []
            if (worst["utilization_pct"] or 0) < 50:
                reasons.append(f"truck only {worst['utilization_pct']}% full ({worst['vehicle']}, {worst['capacity_kg']:.0f} kg capacity)")
            if sav < 20:
                reasons.append(f"little consolidation benefit — {sav:.0f}% shorter than individual trips")
            if (worst["km_per_pickup"] or 0) > 8:
                reasons.append(f"{worst['km_per_pickup']} km per pickup — stops are spread out")
            ans = (f"Least efficient route: **{worst['code']}** (score {worst['opt_score']}/100, {worst['total_km']:.1f} km, {worst['pickups']} pickups).\n\n"
                   + "\n".join(f"- {r}" for r in (reasons or ["no single dominant issue — score reflects time-window misses"])) + f"\n\n_Solver note:_ {worst['explanation']}")
    elif "capacity" in q or "available" in q:
        # Landfills are disposal, not processing capacity; commissioning plants cannot take loads yet.
        fs = sorted([f for f in t("get_facility_capacity") if f["technology"] != "landfill" and f["status"] == "online"], key=lambda f: -f["available_tpd"])
        top = fs[0]
        ans = (f"**{top['label']} — {top['name']}** has the most available capacity: {top['available_tpd']} t/day free ({100 - top['utilization_pct']:.0f}% of {top['capacity_tpd']} t/day).\n\n"
               + "\n".join(f"- {f['label']} ({f['technology'].replace('_', ' ')}): {f['available_tpd']} t/day free, {f['utilization_pct']:.0f}% utilised" for f in fs[:6]))
    elif "model" in q or "accura" in q:
        ms = t("get_models")
        ans = "Active models:\n\n" + "\n".join(f"- **{m['model_key']}** {m['version']} — {m['algorithm']}; " + ", ".join(f"{k} {v:.3f}" for k, v in m["metrics"].items() if isinstance(v, (int, float)) and k in ("mape", "r2", "f1", "mae")) for m in ms)
    else:
        k = t("get_kpis")
        ans = (f"Network snapshot (simulated data):\n\n- Waste awaiting pickup: {_fmt(k['waste_available_kg'])} kg across {k['open_pickups']} requests\n"
               f"- In processing: {_fmt(k['in_processing_kg'])} kg ({k['in_processing_shipments']} shipments)\n- Energy: {_fmt(k['energy_kwh_today'])} kWh today, {_fmt(k['energy_kwh_30d'])} kWh in 30 days\n"
               f"- CO₂ avoided (30 d): {_fmt(k['co2_avoided_kg_30d'])} kg\n- Active routes: {k['active_routes']}; open alerts: {k['open_alerts']}\n\n"
               "Try: *Why did the AI select Facility B?*, *Which waste source should we prioritise today?*, *How much CO₂ did we avoid this week?*")
    return {"answer": ans, "tools": used, "engine": "offline data router (set ANTHROPIC_API_KEY to enable Claude)"}
