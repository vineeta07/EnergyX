# Circular economy: recyclability, upcycling, battery second life

Energy recovery is not the first choice for every kilogram. WattCycle applies the waste hierarchy at the hub, before any energy decision:

```
reuse / upcycle  >  recycle  >  energy recovery  >  landfill
```

Three flows implement it. Each is closed-loop like the energy flow: an AI decision, a real-world outcome, then feedback that changes the next decision.

| Flow | AI (Python) | Feedback that improves it |
|---|---|---|
| Recyclable vs non-recyclable | Beta prior per stream, updated by the vision model's photo sample audit | Every photo audit refines the per-stream recyclable share |
| Upcycling | Partner matching: value, CO2e, learned acceptance, distance | Partner receipts (accepted vs rejected kg) update a Beta posterior per partner |
| Battery second life | Grading (safety, SoH, IR, remaining cycles), plus pack design with OR-Tools CP-SAT | Pack telemetry (SoH vs cycles) updates the per-chemistry fade rate used for grading |

---

## 1. Recyclable vs non-recyclable

**Where:** `ai-service/ml/circular/recyclability.py`, called inside `/v1/classify`.

- **Item-level labels.** Each of the vision model's 30 item classes has a recyclability label that reflects Delhi practice (what MRFs and the kabadi chain actually buy):
  - Recyclable: PET/HDPE bottles, cans, cardboard, paper, glass.
  - Non-recyclable: thin film bags, cutlery and straws (single-use plastic ban, 2022), styrofoam, and PE-lined paper cups.
  - Biodegradable: food, tea bags, coffee grounds, eggshells. These are not recyclable, but they are compost or biomethanation feed.
- **Every photo** gets a recyclability label and probability, plus the reason.
- **Load level:** each stream's recyclable share starts from an assumed prior and is updated with each usable photo as soft counts (Beta posterior).

  | Stream | Organic | Plastic | Paper | Metal | Other |
  |---|---|---|---|---|---|
  | Prior recyclable share | 0 | 0.45 | 0.70 | 0.95 | 0.15 |

  The prior is worth 6 sampled items per stream.
- **Routing (`server/src/services/pipeline.ts → streamSplit`).** For each stream:
  - Upcycle lots set aside at the hub come out first.
  - The recyclable share of plastic and paper becomes a *Recycling* pathway decision to the nearest MRF.
  - Only the remainder is ranked for energy recovery.
  - Recyclable glass (in "other") is counted, but no MRF in the Delhi network accepts glass, so it goes to upcycling or the residual route.

## 2. Upcycling

**Where:** `ml/circular/upcycle.py`, `server/src/services/circular.ts`, page `/upcycling`.

1. **Identify.** The hub operator sees *Upcycling opportunities* on the classification page for five categories: textiles and shoes, glass jars and bottles, PET bottles, HDPE containers, and cardboard boxes.
   - The estimate comes from Delhi priors (≈3% textiles, ≈1% glass, …) × an upcycle-grade rate, refined by photos.
   - **Set aside** creates an upcycle lot.
2. **Match.** The AI scores every partner that accepts the category. A partner is excluded if it doesn't accept the category or lacks weekly capacity. The score is:

   ```
   score = 40% net value (price × expected accepted kg − transport)
         + 35% CO2e avoided
         + 15% learned acceptance
         + 10% proximity
   ```

   It also compares the result with the default route (e.g. textiles → WtE, PET → flake recycling). If upcycling doesn't beat it, the AI says so.
3. **Dispatch** to the chosen partner (operator override allowed), or **send to default route**.
4. **Partner receipt.** Accepted vs rejected kg. This is the feedback:
   - acceptance = Beta(8 × 0.85 + accepted/50, 8 × 0.15 + rejected/50)
   - The next match uses it.
   - Rejects return to the default route.
5. **Products made:** units and revenue.

## 3. Battery second life (e-waste)

**Where:** `ml/circular/battery.py`, `server/src/services/circular.ts`, page `/batteries`.

> Combined old batteries **store** electricity; they don't generate it. The energy comes from whatever charges them (rooftop solar at a hub, or off-peak grid). The value is a working storage pack made from waste, which avoids manufacturing a new one, plus material recovery from the units that fail.

1. **Intake.** A lot (e.g. 240 laptop 18650 cells, EV LFP modules, or e-rickshaw 12 V lead-acid blocks) gets one traceable serial per unit.
2. **Test.** Capacity (Ah), internal resistance, open-circuit voltage, swelling and leakage for each unit.
   - Demo mode simulates a realistic spread per source.
   - Real tester CSV can be pasted.
3. **AI grade:**
   - **R (recycle):** swollen or leaking; deep-discharged below the safe voltage (internal copper-shunt risk); IR > 2.5× new; or SoH < 65%.
   - **A:** SoH ≥ 80% and IR ≤ 1.6× new. Suitable for traction or stationary use.
   - **B:** SoH ≥ 65% and IR ≤ 2.0× new. Suitable for low-power uses (street lights, solar storage).
   - **Remaining cycles** = (SoH − 0.60) / fade, where fade = chemistry prior × (1 + 0.6 × (IR ratio − 1)).
4. **AI pack design** for an application (hub solar storage 48 V, e-rickshaw 48 V, street light 12 V, telecom/MRF backup 48 V):
   1. Series count S = target V ÷ unit V.
   2. Keep units that meet the application's SoH floor; drop IR outliers (> 1.5× median), because parallel units must share current.
   3. Choose the S × P units with the tightest capacity spread.
   4. Split them into S parallel groups of P with **OR-Tools CP-SAT**. It maximises the weakest group and then minimises the spread, because a series string is only as strong as its weakest group.
   5. The result is compared with assembling the same pool without matching (random groups). Example: 13S14P NMC, 0.04% imbalance vs 11.3% unmatched.
   6. Outputs: usable kWh, predicted cycles and years, lifetime MWh, CO2e avoided (manufacturing + operation), and cost vs a new pack.
5. **Assemble → deploy → telemetry.** BMS readings (simulated in demo) report kWh delivered and SoH per cycle.
6. **Learn.**
   - Each pack's observed fade (least squares on SoH vs cycles) is pooled with the literature prior (weight 5) into a per-chemistry posterior.
   - It is always recomputed from the prior plus all telemetry, so nothing is double-counted.
   - The posterior replaces the prior in future grading.
7. **Recycle.** Grade-R units go to an authorised recycler (Battery Waste Management Rules 2022, EPR), with expected material recovery:

   | Chemistry | Expected recovery |
   |---|---|
   | NMC | ≈35% black mass (Ni, Co, Mn, Li), 8% copper, 6% aluminium |
   | Lead-acid | ≈65% lead |

## Assumptions (labelled in the UI; replace with measured values)

| Item | Value | Basis |
|---|---|---|
| Stream recyclable priors | plastic 45%, paper 70%, metal 95%, other 15% | Delhi mixed MSW: film/multilayer share, soiled paper, glass in "other" |
| Upcycle priors | textiles 3% × 30% grade, glass 1% × 50%, PET 0.6% × 60%, HDPE 0.4% × 50%, cardboard 2% × 35% | Delhi MSW composition ranges; informal sector removes most PET first |
| CO2e avoided, upcycling (kg/kg) | textile 8, glass 0.6, PET 1.8, HDPE 1.5, cardboard 0.9 | Conservative: partial displacement of new products |
| CO2e avoided, recycling (kg/kg) | textile 3, glass 0.3, PET 1.4, HDPE 1.2, cardboard 0.7 | Same basis |
| Partner prices (INR/kg) | PET 30, HDPE 20–26, textile 8–12, cardboard 11, glass 3–4 | Delhi scrap-market ranges; demo partners |
| Fade per cycle (second life) | NMC 2.5e-4, LFP 8e-5, lead-acid 1.2e-3 | Literature ranges; learned from telemetry |
| Usable depth of discharge | NMC 80%, LFP 90%, lead-acid 50% | Common second-life practice |
| Embodied CO2e of a new pack | NMC 75, LFP 70, lead-acid 30 kg/kWh | Literature ranges |
| New vs repurposed cost | new NMC ₹15k/kWh, LFP ₹13k/kWh, lead-acid ₹9k/kWh; repurposing ₹4.5k/kWh | Indicative |
| Grid factor | 0.71 kg CO2/kWh | CEA baseline (approx.); diesel backup 0.8 |

**Simulated in demo mode** (flagged in the UI): battery tester readings, pack BMS telemetry, and the partners. Partner names are generic, at real Delhi-NCR localities.

## API

| Method | Path | Role |
|---|---|---|
| GET | `/api/circular/summary`, `/api/circular/partners` | any signed-in user |
| GET/POST | `/api/upcycling/lots` | hub, admin (POST) |
| POST | `/api/upcycling/lots/:id/match` · `dispatch` · `receive` · `complete` | hub, admin |
| GET/POST | `/api/batteries/lots`, `/api/batteries/lots/:id` | hub, admin (POST) |
| POST | `/api/batteries/lots/:id/test` (`{simulate:true}` or `{readings:[…]}`) · `/recycle` | hub, admin |
| POST | `/api/batteries/packs/design` · `/:id/assemble` · `/:id/deploy` · `/:id/simulate` · `/api/batteries/learn` | hub, admin |

AI service:
- `/v1/circular/upcycle-match`
- `/v1/batteries/grade`
- `/v1/batteries/design-pack`
- `/v1/batteries/update-fade`
- `/v1/batteries/reference`
