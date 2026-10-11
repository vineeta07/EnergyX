"""Recyclability, upcycling match and battery second-life (no trained models needed)."""
import random
import unittest

from ml.circular import battery, recyclability, upcycle
from ml.inference import vision


class RecyclabilityTest(unittest.TestCase):
    comp = {"organic": 0.4, "plastic": 0.2, "paper": 0.15, "metal": 0.05, "other": 0.2}

    def test_every_vision_class_has_a_label(self):
        self.assertEqual(set(recyclability.ITEMS), set(vision.CLASSES))

    def test_prior_split_adds_up(self):
        r = recyclability.estimate(self.comp, 10_000)
        self.assertAlmostEqual(r["recyclable_kg"] + r["non_recyclable_kg"], 10_000, delta=1)
        self.assertEqual(r["biodegradable_kg"], 4000)
        plastic = next(s for s in r["by_stream"] if s["stream"] == "plastic")
        self.assertAlmostEqual(plastic["recyclable_share"], recyclability.PRIOR_SHARE["plastic"])

    def test_photos_move_plastic_share(self):
        def photo(cls):
            probs = {c: 0.0 for c in vision.CLASSES}
            probs[cls] = 1.0
            return {"class_probs": probs, "weight": 1.0}
        bags = recyclability.estimate(self.comp, 10_000, [photo("plastic_shopping_bags")] * 10)
        pet = recyclability.estimate(self.comp, 10_000, [photo("plastic_water_bottles")] * 10)
        share = lambda r: next(s for s in r["by_stream"] if s["stream"] == "plastic")["recyclable_share"]
        self.assertLess(share(bags), 0.2)
        self.assertGreater(share(pet), 0.75)
        # PET photos also raise the PET upcycling estimate
        up = {u["category"]: u for u in pet["upcycling"]}
        self.assertGreater(up["pet_bottle"]["upcyclable_kg"], 100)


class UpcycleTest(unittest.TestCase):
    partners = [
        {"id": 1, "name": "Near", "prices": {"textile": 10}, "capacity_kg_week": 2000, "distance_km": 5, "transport_cost_inr": 300, "transport_co2_kg": 4},
        {"id": 2, "name": "Far", "prices": {"textile": 11}, "capacity_kg_week": 2000, "distance_km": 90, "transport_cost_inr": 5000, "transport_co2_kg": 70},
        {"id": 3, "name": "Full", "prices": {"textile": 30}, "capacity_kg_week": 100, "distance_km": 3, "transport_cost_inr": 200, "transport_co2_kg": 2},
        {"id": 4, "name": "Glass only", "prices": {"glass_container": 3}, "capacity_kg_week": 5000, "distance_km": 2, "transport_cost_inr": 100, "transport_co2_kg": 1},
    ]

    def test_picks_feasible_best_and_explains_exclusions(self):
        r = upcycle.match("textile", 500, self.partners)
        self.assertEqual(r["chosen_partner_id"], 1)
        excluded = {x["partner_id"]: x["exclusion_reason"] for x in r["ranking"] if not x["eligible"]}
        self.assertIn("capacity", excluded[3])
        self.assertIn("does not accept", excluded[4])
        self.assertGreater(r["gain_vs_fallback"]["co2_kg"], 0)

    def test_acceptance_learns_from_rejections(self):
        self.assertLess(upcycle.acceptance_rate(1000, 400), upcycle.acceptance_rate(0, 0))
        self.assertGreater(upcycle.acceptance_rate(1000, 1000), upcycle.acceptance_rate(0, 0))


def _cells(n, seed=1, chem="li_nmc", v=3.65, ah=2.6):
    r = random.Random(seed)
    out = []
    for i in range(n):
        soh = min(1.0, max(0.4, r.gauss(0.8, 0.08)))
        out.append({"id": i + 1, "chemistry": chem, "nominal_v": v, "nominal_ah": ah, "measured_ah": round(ah * soh, 3),
                    "ir_mohm": round(35 * (1 + (1 - soh) * 1.5) * r.uniform(0.9, 1.1), 2), "voltage": 3.7, "swelling": False, "leakage": False})
    return out


class BatteryTest(unittest.TestCase):
    def test_safety_rejects_and_grades(self):
        cells = _cells(4)
        cells[0]["swelling"] = True
        cells[1]["voltage"] = 1.2
        cells[2]["measured_ah"] = 2.5   # 96% SoH
        cells[3]["measured_ah"] = 1.3   # 50% SoH
        g = {u["id"]: u for u in battery.grade(cells)["units"]}
        self.assertEqual(g[1]["grade"], "R")
        self.assertIn("deep-discharged", g[2]["reason"])
        self.assertEqual(g[3]["grade"], "A")
        self.assertGreater(g[3]["remaining_cycles"], 0)
        self.assertEqual(g[4]["grade"], "R")

    def test_pack_is_balanced_and_beats_random_assembly(self):
        cells = _cells(160, seed=7)
        graded = {u["id"]: u for u in battery.grade(cells)["units"]}
        units = [{**c, **graded[c["id"]]} for c in cells if graded[c["id"]]["grade"] != "R"]
        d = battery.design_pack(units, "solar_storage_48v", time_s=2.0)
        self.assertEqual(d["series"], 13)  # 48 V / 3.65 V
        self.assertEqual(d["units_used"], d["series"] * d["parallel"])
        used = [i for g in d["groups"] for i in g["unit_ids"]]
        self.assertEqual(len(used), len(set(used)))
        self.assertLess(d["imbalance_pct"], 1.0)
        self.assertLess(d["imbalance_pct"], d["baseline_random"]["imbalance_pct"])
        self.assertGreaterEqual(d["usable_kwh"], d["baseline_random"]["usable_kwh"])
        self.assertGreater(d["predicted_cycles"], 0)

    def test_target_kwh_limits_parallel_count(self):
        cells = _cells(160, seed=3)
        graded = {u["id"]: u for u in battery.grade(cells)["units"]}
        units = [{**c, **graded[c["id"]]} for c in cells if graded[c["id"]]["grade"] != "R"]
        d = battery.design_pack(units, "streetlight_12v", target_kwh=0.1, time_s=1.0)
        self.assertEqual(d["series"], 3)
        self.assertGreaterEqual(d["usable_kwh"], 0.1)
        self.assertLess(d["usable_kwh"], 0.2)

    def test_fade_update_moves_toward_observation(self):
        pts = [{"cycles": c, "soh": 0.85 - 5e-4 * c} for c in range(0, 400, 20)]
        r = battery.update_fade("li_nmc", 2.5e-4, 5, [{"id": 1, "predicted_fade": 2.5e-4, "points": pts}])
        self.assertGreater(r["posterior_fade"], 2.5e-4)
        self.assertAlmostEqual(r["packs"][0]["observed_fade"], 5e-4, places=6)


if __name__ == "__main__":
    unittest.main()
