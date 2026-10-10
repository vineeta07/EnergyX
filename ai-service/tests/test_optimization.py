"""Unit tests for the solvers and the vision label mapping (no trained models or network needed).

    python -m unittest discover -s tests
"""
import unittest

from ml.inference import vision
from ml.optimization import city_plan, routing


class RoutingTest(unittest.TestCase):
    depot = {"id": 0, "name": "hub", "lat": 28.52, "lng": 77.28}
    vehicles = [{"id": 1, "code": "T", "capacity_kg": 15000}]
    stops = [{"id": i, "name": str(i), "lat": 28.5 + i * 0.02, "lng": 77.2, "demand_kg": 3000} for i in range(1, 4)]

    def test_uses_real_road_matrix_when_given(self):
        m = [[0, 10, 12, 14], [10, 0, 3, 5], [12, 3, 0, 3], [14, 5, 3, 0]]
        r = routing.optimize(self.depot, self.vehicles, self.stops, distance_matrix_km=m, duration_matrix_min=m, distance_source="osrm")
        self.assertEqual(r["distance_source"], "osrm")
        route = r["routes"][0]
        self.assertEqual(sorted(route["stop_ids"]), [1, 2, 3])
        self.assertAlmostEqual(route["total_km"], 30.0)  # 0-1-2-3-0 = 10+3+3+14
        self.assertLess(route["total_km"], route["baseline_km"])

    def test_respects_vehicle_capacity(self):
        small = [{"id": 1, "code": "A", "capacity_kg": 6000}, {"id": 2, "code": "B", "capacity_kg": 6000}]
        r = routing.optimize(self.depot, small, self.stops)
        for route in r["routes"]:
            self.assertLessEqual(route["load_kg"], 6000)
        served = sum(len(x["stop_ids"]) for x in r["routes"]) + len(r["unassigned"])
        self.assertEqual(served, 3)


class CityPlanTest(unittest.TestCase):
    zones = [{"name": "Z1", "tpd": 1000, "current_destinations": ["A", "L"]}, {"name": "Z2", "tpd": 800, "current_destinations": ["L"]}]
    facs = [
        {"code": "A", "label": "Plant A", "technology": "combustion", "status": "online", "capacity_tpd": 900, "kwh_per_t": 300},
        {"code": "B", "label": "Plant B", "technology": "combustion", "status": "online", "capacity_tpd": 500, "kwh_per_t": 240},
        {"code": "L", "label": "Landfill", "technology": "landfill", "status": "online", "capacity_tpd": 5000, "kwh_per_t": 0},
        {"code": "G", "label": "Digester", "technology": "anaerobic_digestion", "status": "commissioning", "capacity_tpd": 250, "kwh_per_t": 150},
    ]
    dist = {"Z1": {"A": 5, "B": 20, "L": 10, "G": 30}, "Z2": {"A": 15, "B": 8, "L": 12, "G": 25}}

    def test_capacities_respected_and_all_tonnage_assigned(self):
        p = city_plan.plan(self.zones, self.facs, self.dist)
        opt = p["optimized"]
        self.assertLessEqual(opt["by_facility_tpd"]["A"], 900 + 1)
        self.assertLessEqual(opt["by_facility_tpd"]["B"], 500 + 1)
        self.assertEqual(opt["by_facility_tpd"].get("G", 0), 0)  # commissioning plants get nothing
        self.assertAlmostEqual(sum(opt["by_facility_tpd"].values()), 1800, delta=2)

    def test_optimized_beats_current_practice(self):
        p = city_plan.plan(self.zones, self.facs, self.dist)
        self.assertGreater(p["optimized"]["net_energy_mwh_day"], p["current"]["net_energy_mwh_day"])
        self.assertLess(p["optimized"]["landfill_tpd"], p["current"]["landfill_tpd"])
        # all WtE capacity is used before anything is landfilled
        self.assertAlmostEqual(p["optimized"]["landfill_tpd"], 1800 - 900 - 500, delta=2)


class VisionMappingTest(unittest.TestCase):
    def test_every_class_maps_to_a_stream(self):
        self.assertEqual(len(vision.CLASSES), 30)
        self.assertEqual(len(set(vision.CLASSES)), 30)
        self.assertEqual(sorted(vision.CLASSES), vision.CLASSES)  # Keras label order is alphabetical
        for c in vision.CLASSES:
            self.assertIn(vision.STREAM_OF[c], vision.VISION_STREAMS)
        self.assertEqual(vision.STREAM_OF["food_waste"], "organic")
        self.assertEqual(vision.STREAM_OF["glass_food_jars"], "glass")


if __name__ == "__main__":
    unittest.main()
