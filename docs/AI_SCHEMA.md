# WattCycle AI Schema — models, training data, and the move to real data

Status legend: ✅ real data · 🟡 partly real · 🔴 simulated (demo seed)

## 0. Shared vocabulary

**Waste streams.** The vision model already distinguishes 6 streams. The tabular and energy models still use 5, with glass and textile folded into `other`.

| stream | examples | pathway |
|---|---|---|
| `organic` | food waste, coffee grounds, eggshells, tea bags, market/farm residue | anaerobic digestion (biogas) / composting |
| `plastic` | bottles, containers, bags, cutlery, styrofoam | RDF co-processing / pyrolysis / recycling |
| `paper` | cardboard, newspaper, office paper, paper cups | recycling / combustion |
| `metal` | aluminium and steel cans, aerosol cans | material recovery |
| `glass` *(proposed)* | bottles, jars | material recovery |
| `textile` *(proposed)* | clothing, shoes | reuse / RDF |
| `other` | residual, inert, hazardous-excluded | sanitary landfill / RDF reject |

**Proposal:** promote `glass` and `textile` to first-class streams in `schema.sql` and in the energy model once real data has them.

---

## 1. Models and their data contracts

### M1 · Waste image classifier ✅ (real, pretrained)
| | |
|---|---|
| Model | `Darshan764/waste-classification-v2`: EfficientNetB0, Keras 3 on the PyTorch backend, 30 item classes → 6 streams |
| Trained on | Kaggle *Recyclable and Household Waste Classification* (15,000 real photos) |
| Input | One photo of **one item**, any size (resized to 224×224) |
| Output | Top-k item classes, stream probabilities, confidence |
| Independent real test (our run) | TrashNet 500 photos: **61.8%** stream accuracy (79.0% when confidence ≥ 0.8). Organic-vs-recyclable 600 photos: **78.7%** (91.1% when ≥ 0.8). Weak spots: glass (37% recall, confused with plastic) and organic recall (61%) |
| Report | `ai-service/ml/evaluation/reports/vision_eval.json`, reproducible with `python -m ml.evaluation.vision_eval` |
| How we use it | Hub "sample audit": 5–20 photos of random items from a load. Photos ≥ 0.8 confidence count fully, 0.5–0.8 count half, < 0.5 are ignored and flagged for review. They update the M2 prior through a Dirichlet update |

**Fine-tuning dataset schema** (to raise accuracy on *our* images):

| field | type | notes |
|---|---|---|
| `image` | jpg/png | one item, natural background |
| `label` | one of the 30 item classes **or** a stream | stream-only labels are fine for a stream head |
| `source` | text | `kaggle`, `trashnet`, `hub_upload`, … |
| `split` | train/val/test | test = our own hub photos only |

### M2 · Load composition model 🔴 → 🟡
| | |
|---|---|
| Purpose | Prior composition of a truck load **before** photos, from where the waste came from |
| Model | Multi-output random forest (5 fractions + moisture) |
| Input | Source mix (kg per business type), load kg, month |
| Label | Measured composition of the load (fractions sum to 1) + moisture % |
| Today | 220 simulated lab audits + operator corrections (weighted 3×) |
| Real data needed | **Waste audits / characterisation studies**: per load or per generator type, % organic/plastic/paper/metal/glass/other. Even 50–100 real audits make this credible |

Training table `waste_compositions` (already in the DB):

| field | type |
|---|---|
| `shipment_id` → `shipments.source_mix` (`[{business_type, kg}]`), `total_kg`, `arrived_at` | |
| `organic, plastic, paper, metal, other` | float 0–1 |
| `moisture_pct` | float |
| `origin` | `lab_audit` / `operator` / `ai` (only the first two are training labels) |

### M3 · Waste generation forecast 🔴
| | |
|---|---|
| Purpose | kg/day per source, 7 days ahead, for pickup planning |
| Model | LightGBM on scale-normalised lags, rolling means and calendar features |
| Today | 2,300 simulated daily records (20 sources × 120 days). Test MAPE 7.6% vs 11.9% naive (on simulated data) |
| Real data needed | **Daily (or per-pickup) kg per generator** for ≥ 8 weeks. Ideally 10+ sources |

Training table `waste_records`:

| field | type | required |
|---|---|---|
| `source_id` | int | ✔ |
| `record_date` | date | ✔ |
| `quantity_kg` | float | ✔ |
| `waste_type` | text | ✔ |
| `business_type` (via `waste_sources`) | enum | ✔ |
| `moisture_pct` | float | optional |
| covers / footfall / occupancy | int | optional, strongly predictive for restaurants and hotels |

### M4 · Energy yield model 🔴
| | |
|---|---|
| Purpose | kWh a given facility will produce from a given batch |
| Model | LightGBM on kWh/kg with leakage-safe historical facility yield; 90% intervals, calibrated confidence |
| Today | ~530 simulated meter readings |
| Real data needed | **Facility-level batch or daily records**: input tonnes by stream, energy out (kWh or m³ biogas × CH₄ %), moisture or total solids, plant type and capacity. Public alternatives are listed in §2 |

Training table `energy_outputs` joined with `facilities` and `facility_capabilities`:

| field | type | required |
|---|---|---|
| `facility_id`, `technology`, `capacity_tpd`, `efficiency_pct` | | ✔ |
| `recorded_at` | timestamp | ✔ |
| `stream` | enum | ✔ |
| `input_kg` | float | ✔ |
| `actual_kwh` (or `biogas_m3` + `ch4_pct`) | float | ✔ |
| `moisture_pct` / total solids % / volatile solids % | float | strongly recommended |
| `utilization_pct` at the time | float | optional |

### M5 · Facility ranking ✅ (no training data needed)
Weighted utility over M4 predictions + distance/cost/CO₂. It needs **real facility attributes**:

| field | type |
|---|---|
| `name, lat, lng, technology` | |
| `capacity_tpd, current_utilization_pct` | |
| `accepted streams + compatibility %, max moisture %` | |
| `gate_fee_inr_per_t` | |

### M6 · Route optimization ✅ (no training data needed)
OR-Tools VRP. It needs **real fleet and road inputs**: vehicle capacities, depot locations, pickup time windows, and real road distances (Amazon Location Service / OSRM instead of great-circle × 1.25).

---

## 2. Real data sources we can use without anyone's private data

| Model | Public real data | Notes |
|---|---|---|
| M1 vision | Kaggle *Recyclable and Household Waste* (15k), TrashNet (2.5k, MIT), Kaggle *Waste Classification O/R* (25k) | Already downloaded TrashNet + O/R into `ml/data/datasets/` for evaluation |
| M2 composition | CPCB / MoHUA SWM reports (city-level composition), published Indian waste-characterisation studies | City-level, so it can only calibrate priors |
| M3 forecast | Rarely public at generator level. Alternatives: municipal ward-level daily tonnage (open-data portals), or **your partner restaurants / hostels** | The most important ask, see §3 |
| M4 energy | Published biomethane-potential (BMP) tables for food waste (m³ CH₄ per kg VS), MNRE / plant annual reports, the UCI/Kaggle anaerobic-digestion datasets | Lets us replace simulated factors with literature-calibrated ones |
| M5 / M6 | OpenStreetMap / Amazon Location for roads; facility lists from MNRE / state pollution-control boards | Real names and coordinates |

---

## 3. What we need from the team

Priority order:
1. **Kaggle API token** (`kaggle.json`): to download the 15k-image dataset the vision model was trained on, so we can fine-tune M1 on Kaggle + TrashNet + O/R together. This is the biggest accuracy win available right now.
2. **Our own photos** (50–200): real waste items or loads from a canteen, hostel or market, labelled by stream. These become the true test set, the most honest accuracy number we can show.
3. **Any real generation data**: daily kg from even one canteen, hostel mess or restaurant for 4–8 weeks (CSV: `date, source, kg, waste_type`). Without it, M3 stays on simulated data.
4. **Real facility list for the demo city**: name, location, technology, capacity (a few biogas plants and an MRF are enough).
5. **Decision:** keep 5 streams for the hackathon, or promote `glass` and `textile` now (§0).
6. **Optional:** an energy dataset or plant report you trust for M4 calibration. Otherwise I use published BMP values.
