-- WattCycle relational schema (PostgreSQL 15+).
-- Runs unchanged on embedded PGlite (local demo) and on Amazon RDS for PostgreSQL.
-- Coordinates are stored as lat/lng doubles; on RDS the PostGIS migration
-- (infra/sql/postgis.sql) adds geography(Point) columns + GiST indexes.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('generator','fleet','hub','facility','admin','citizen')),
  organization  TEXT,
  facility_id   INT,
  hub_id        INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processing_hubs (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  capacity_tpd    DOUBLE PRECISION NOT NULL,
  current_load_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'online'
);

CREATE TABLE IF NOT EXISTS waste_sources (
  id                  SERIAL PRIMARY KEY,
  user_id             INT REFERENCES users(id),
  name                TEXT NOT NULL,
  business_type       TEXT NOT NULL,
  address             TEXT,
  city                TEXT NOT NULL DEFAULT 'Delhi',
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  waste_type          TEXT NOT NULL,
  avg_daily_kg        DOUBLE PRECISION NOT NULL,
  frequency           TEXT NOT NULL DEFAULT 'daily',
  operating_hours     TEXT,
  storage_capacity_kg DOUBLE PRECISION,
  contamination_pct   DOUBLE PRECISION DEFAULT 10,
  status              TEXT NOT NULL DEFAULT 'active',
  image_key           TEXT,
  is_simulated        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily generation history per source (feeds the forecasting model).
CREATE TABLE IF NOT EXISTS waste_records (
  id            SERIAL PRIMARY KEY,
  source_id     INT NOT NULL REFERENCES waste_sources(id) ON DELETE CASCADE,
  pickup_id     INT,
  record_date   DATE NOT NULL,
  quantity_kg   DOUBLE PRECISION NOT NULL,
  waste_type    TEXT NOT NULL,
  moisture_pct  DOUBLE PRECISION,
  is_simulated  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waste_records_source_date ON waste_records(source_id, record_date);

CREATE TABLE IF NOT EXISTS vehicles (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL,
  capacity_kg     DOUBLE PRECISION NOT NULL,
  current_load_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  heading         DOUBLE PRECISION DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'idle',
  fuel_l_per_km   DOUBLE PRECISION NOT NULL DEFAULT 0.24,
  hub_id          INT REFERENCES processing_hubs(id),
  driver          TEXT,
  active_route_id INT
);

CREATE TABLE IF NOT EXISTS routes (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL,
  vehicle_id    INT REFERENCES vehicles(id),
  kind          TEXT NOT NULL CHECK (kind IN ('collection','dispatch')),
  status        TEXT NOT NULL DEFAULT 'planned',
  total_km      DOUBLE PRECISION,
  baseline_km   DOUBLE PRECISION,
  duration_min  DOUBLE PRECISION,
  fuel_l        DOUBLE PRECISION,
  co2_kg        DOUBLE PRECISION,
  cost_inr      DOUBLE PRECISION,
  opt_score     DOUBLE PRECISION,
  solver        TEXT,
  explanation   TEXT,
  progress      DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS route_stops (
  id         SERIAL PRIMARY KEY,
  route_id   INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  seq        INT NOT NULL,
  stop_type  TEXT NOT NULL CHECK (stop_type IN ('depot','pickup','hub','facility')),
  ref_id     INT,
  name       TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  load_kg    DOUBLE PRECISION DEFAULT 0,
  eta_min    DOUBLE PRECISION,
  status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS pickup_requests (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  source_id       INT NOT NULL REFERENCES waste_sources(id),
  requested_by    INT REFERENCES users(id),
  quantity_kg     DOUBLE PRECISION NOT NULL,
  waste_type      TEXT NOT NULL,
  urgency         TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','critical')),
  window_start    TIMESTAMPTZ,
  window_end      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'REQUESTED'
                  CHECK (status IN ('REQUESTED','ASSIGNED','EN_ROUTE','COLLECTED','DELIVERED','CANCELLED')),
  vehicle_id      INT REFERENCES vehicles(id),
  route_id        INT REFERENCES routes(id),
  shipment_id     INT,
  estimated_cost  DOUBLE PRECISION,
  estimated_co2   DOUBLE PRECISION,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A consolidated load that arrives at a hub (WC-1042 etc.).
CREATE TABLE IF NOT EXISTS shipments (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  hub_id        INT NOT NULL REFERENCES processing_hubs(id),
  route_id      INT REFERENCES routes(id),
  source_label  TEXT NOT NULL,
  total_kg      DOUBLE PRECISION NOT NULL,
  measured_kg   DOUBLE PRECISION,
  moisture_pct  DOUBLE PRECISION,
  category      TEXT,
  status        TEXT NOT NULL DEFAULT 'awaiting_classification'
                CHECK (status IN ('in_transit','awaiting_classification','classified','dispatched','processed')),
  source_mix    JSONB NOT NULL DEFAULT '[]',
  arrived_at    TIMESTAMPTZ,
  is_simulated  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lab-audited or AI-estimated composition of a shipment.
CREATE TABLE IF NOT EXISTS waste_compositions (
  id           SERIAL PRIMARY KEY,
  shipment_id  INT REFERENCES shipments(id) ON DELETE CASCADE,
  organic      DOUBLE PRECISION NOT NULL,
  plastic      DOUBLE PRECISION NOT NULL,
  paper        DOUBLE PRECISION NOT NULL,
  metal        DOUBLE PRECISION NOT NULL,
  other        DOUBLE PRECISION NOT NULL,
  moisture_pct DOUBLE PRECISION,
  origin       TEXT NOT NULL CHECK (origin IN ('lab_audit','ai','operator')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waste_classifications (
  id              SERIAL PRIMARY KEY,
  shipment_id     INT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  model_version   TEXT,
  method          TEXT NOT NULL,
  composition     JSONB NOT NULL,
  uncertainty     JSONB,
  confidence      DOUBLE PRECISION NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending_review'
                  CHECK (status IN ('pending_review','confirmed','corrected','rejected')),
  corrected       JSONB,
  image_key       TEXT,
  operator_id     INT REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facilities (
  id                       SERIAL PRIMARY KEY,
  code                     TEXT NOT NULL UNIQUE,
  label                    TEXT NOT NULL,
  name                     TEXT NOT NULL,
  lat                      DOUBLE PRECISION NOT NULL,
  lng                      DOUBLE PRECISION NOT NULL,
  technology               TEXT NOT NULL,
  capacity_tpd             DOUBLE PRECISION NOT NULL,
  utilization_pct          DOUBLE PRECISION NOT NULL,
  efficiency_pct           DOUBLE PRECISION NOT NULL,
  carbon_intensity         DOUBLE PRECISION NOT NULL,
  gate_fee_inr_per_t       DOUBLE PRECISION NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'online',
  is_simulated             BOOLEAN NOT NULL DEFAULT false,
  sim_params               JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facility_capabilities (
  id                SERIAL PRIMARY KEY,
  facility_id       INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  stream            TEXT NOT NULL,
  compatibility_pct DOUBLE PRECISION NOT NULL,
  max_moisture_pct  DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS energy_predictions (
  id                SERIAL PRIMARY KEY,
  shipment_id       INT REFERENCES shipments(id),
  classification_id INT REFERENCES waste_classifications(id),
  facility_id       INT REFERENCES facilities(id),
  stream            TEXT NOT NULL,
  quantity_kg       DOUBLE PRECISION NOT NULL,
  technology        TEXT NOT NULL,
  predicted_kwh     DOUBLE PRECISION NOT NULL,
  biogas_m3         DOUBLE PRECISION,
  heat_kwh          DOUBLE PRECISION,
  interval_low      DOUBLE PRECISION,
  interval_high     DOUBLE PRECISION,
  confidence        DOUBLE PRECISION,
  model_version     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS energy_outputs (
  id             SERIAL PRIMARY KEY,
  facility_id    INT NOT NULL REFERENCES facilities(id),
  prediction_id  INT REFERENCES energy_predictions(id),
  shipment_id    INT REFERENCES shipments(id),
  stream         TEXT NOT NULL,
  input_kg       DOUBLE PRECISION NOT NULL,
  moisture_pct   DOUBLE PRECISION,
  actual_kwh     DOUBLE PRECISION NOT NULL,
  efficiency_pct DOUBLE PRECISION,
  source         TEXT NOT NULL DEFAULT 'manual',
  is_simulated   BOOLEAN NOT NULL DEFAULT false,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_energy_outputs_recorded ON energy_outputs(recorded_at);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id                 SERIAL PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  kind               TEXT NOT NULL CHECK (kind IN ('facility_selection','route','pathway')),
  shipment_id        INT REFERENCES shipments(id),
  subject            TEXT NOT NULL,
  chosen_facility_id INT REFERENCES facilities(id),
  inputs             JSONB NOT NULL,
  output             JSONB NOT NULL,
  ranking            JSONB,
  explanation        JSONB NOT NULL,
  feature_importance JSONB,
  weights            JSONB,
  confidence         DOUBLE PRECISION,
  score              DOUBLE PRECISION,
  status             TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','overridden')),
  override_reason    TEXT,
  decided_by         INT REFERENCES users(id),
  model_version      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Closed-loop feedback: every completed conversion / human correction.
CREATE TABLE IF NOT EXISTS feedback_records (
  id                SERIAL PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('energy','classification')),
  prediction_id     INT REFERENCES energy_predictions(id),
  classification_id INT REFERENCES waste_classifications(id),
  decision_id       INT REFERENCES ai_decisions(id),
  shipment_id       INT REFERENCES shipments(id),
  facility_id       INT REFERENCES facilities(id),
  technology        TEXT,
  stream            TEXT,
  waste_quantity_kg DOUBLE PRECISION,
  predicted_kwh     DOUBLE PRECISION,
  actual_kwh        DOUBLE PRECISION,
  error_pct         DOUBLE PRECISION,
  distance_km       DOUBLE PRECISION,
  transport_cost    DOUBLE PRECISION,
  ai_label          JSONB,
  human_label       JSONB,
  training_run_id   INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id           SERIAL PRIMARY KEY,
  model_key    TEXT NOT NULL,
  version      TEXT NOT NULL,
  algorithm    TEXT NOT NULL,
  trained_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  dataset_size INT NOT NULL,
  metrics      JSONB NOT NULL,
  params       JSONB,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','failed')),
  artifact_uri TEXT,
  UNIQUE (model_key, version)
);

CREATE TABLE IF NOT EXISTS training_runs (
  id               SERIAL PRIMARY KEY,
  model_key        TEXT NOT NULL,
  model_version_id INT REFERENCES model_versions(id),
  trigger          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'running',
  dataset_size     INT,
  feedback_rows    INT,
  metrics          JSONB,
  log              JSONB,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  severity    TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  causes      JSONB,
  entity_type TEXT,
  entity_id   INT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Domain event log (mirrors what is published to EventBridge in AWS mode).
CREATE TABLE IF NOT EXISTS events (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- v2: per-photo vision results (sample audit) on classifications
ALTER TABLE waste_classifications ADD COLUMN IF NOT EXISTS vision JSONB;

-- v3: provenance for real-data rows (Delhi MCD / DPCC sources)
ALTER TABLE waste_sources ADD COLUMN IF NOT EXISTS wards INT;
ALTER TABLE waste_sources ADD COLUMN IF NOT EXISTS current_disposal TEXT;
ALTER TABLE waste_sources ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS mw DOUBLE PRECISION;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS data_source TEXT;

-- v4: real road distances (OSRM / OpenStreetMap) between fixed network points
CREATE TABLE IF NOT EXISTS road_distances (
  a_key   TEXT NOT NULL,
  b_key   TEXT NOT NULL,
  km      DOUBLE PRECISION NOT NULL,
  minutes DOUBLE PRECISION NOT NULL,
  source  TEXT NOT NULL DEFAULT 'osrm',
  PRIMARY KEY (a_key, b_key)
);

-- v5: circular economy — recyclability, upcycling, battery second life
ALTER TABLE waste_classifications ADD COLUMN IF NOT EXISTS recyclability JSONB;

-- Upcycling partners and authorised battery recyclers (demo partners, flagged is_simulated)
CREATE TABLE IF NOT EXISTS circular_partners (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('upcycler','battery_recycler')),
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  prices           JSONB NOT NULL DEFAULT '{}',   -- INR per kg the partner pays, by category
  capacity_kg_week DOUBLE PRECISION NOT NULL,
  received_kg      DOUBLE PRECISION NOT NULL DEFAULT 0,  -- feedback: drives the learned acceptance rate
  accepted_kg      DOUBLE PRECISION NOT NULL DEFAULT 0,
  products         TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  is_simulated     BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upcycle_lots (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  hub_id         INT NOT NULL REFERENCES processing_hubs(id),
  shipment_id    INT REFERENCES shipments(id),
  category       TEXT NOT NULL CHECK (category IN ('textile','glass_container','pet_bottle','hdpe_container','cardboard')),
  kg             DOUBLE PRECISION NOT NULL,
  items          INT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'identified'
                 CHECK (status IN ('identified','matched','in_transit','received','upcycled','fallback')),
  partner_id     INT REFERENCES circular_partners(id),
  match          JSONB,
  accepted_kg    DOUBLE PRECISION,
  rejected_kg    DOUBLE PRECISION,
  products       TEXT,
  units_made     INT,
  revenue_inr    DOUBLE PRECISION,
  co2_avoided_kg DOUBLE PRECISION,
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battery_lots (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  hub_id       INT REFERENCES processing_hubs(id),
  source_label TEXT NOT NULL,
  chemistry    TEXT NOT NULL CHECK (chemistry IN ('li_nmc','li_lfp','lead_acid')),
  unit_type    TEXT NOT NULL CHECK (unit_type IN ('cell','module','block')),
  nominal_v    DOUBLE PRECISION NOT NULL,
  nominal_ah   DOUBLE PRECISION NOT NULL,
  unit_kg      DOUBLE PRECISION NOT NULL,
  unit_count   INT NOT NULL,
  ir_ref_mohm  DOUBLE PRECISION,
  status       TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','graded','processed')),
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battery_packs (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  chemistry        TEXT NOT NULL,
  application      TEXT NOT NULL,
  config           TEXT NOT NULL,
  units_used       INT NOT NULL,
  nominal_v        DOUBLE PRECISION NOT NULL,
  capacity_ah      DOUBLE PRECISION NOT NULL,
  usable_kwh       DOUBLE PRECISION NOT NULL,
  imbalance_pct    DOUBLE PRECISION,
  pack_soh         DOUBLE PRECISION NOT NULL,
  fade_pred        DOUBLE PRECISION NOT NULL,
  predicted_cycles INT,
  design           JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'designed' CHECK (status IN ('designed','assembled','deployed','retired')),
  site_name        TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  cycles           DOUBLE PRECISION NOT NULL DEFAULT 0,
  soh_now          DOUBLE PRECISION,
  delivered_kwh    DOUBLE PRECISION NOT NULL DEFAULT 0,
  fade_observed    DOUBLE PRECISION,
  sim_params       JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deployed_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS battery_units (
  id               SERIAL PRIMARY KEY,
  lot_id           INT NOT NULL REFERENCES battery_lots(id) ON DELETE CASCADE,
  serial           TEXT NOT NULL,
  chemistry        TEXT NOT NULL,
  nominal_v        DOUBLE PRECISION NOT NULL,
  nominal_ah       DOUBLE PRECISION NOT NULL,
  measured_ah      DOUBLE PRECISION,
  ir_mohm          DOUBLE PRECISION,
  voltage          DOUBLE PRECISION,
  swelling         BOOLEAN NOT NULL DEFAULT false,
  leakage          BOOLEAN NOT NULL DEFAULT false,
  soh              DOUBLE PRECISION,
  ir_ratio         DOUBLE PRECISION,
  grade            TEXT CHECK (grade IN ('A','B','R')),
  remaining_cycles INT,
  fade_per_cycle   DOUBLE PRECISION,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'untested' CHECK (status IN ('untested','graded','in_pack','to_recycling')),
  pack_id          INT REFERENCES battery_packs(id),
  is_simulated     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_battery_units_lot ON battery_units(lot_id);

CREATE TABLE IF NOT EXISTS pack_telemetry (
  id             SERIAL PRIMARY KEY,
  pack_id        INT NOT NULL REFERENCES battery_packs(id) ON DELETE CASCADE,
  day            DATE NOT NULL,
  discharged_kwh DOUBLE PRECISION NOT NULL,
  cycles_cum     DOUBLE PRECISION NOT NULL,
  soh            DOUBLE PRECISION NOT NULL,
  is_simulated   BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_pack_telemetry_pack ON pack_telemetry(pack_id, day);

CREATE TABLE IF NOT EXISTS battery_recycling (
  id         SERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  lot_id     INT REFERENCES battery_lots(id),
  partner_id INT REFERENCES circular_partners(id),
  chemistry  TEXT NOT NULL,
  units      INT NOT NULL,
  kg         DOUBLE PRECISION NOT NULL,
  recovered  JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- resident app: one row per thing a resident did (sorted an item, looked up a plastic code, read an idea)
-- Databases created before the resident role existed still carry the old role list.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('generator','fleet','hub','facility','admin','citizen'));

CREATE TABLE IF NOT EXISTS citizen_actions (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('scan','resin','guide')),
  item       TEXT NOT NULL,
  material   TEXT,
  verdict    TEXT,
  points     INT NOT NULL DEFAULT 0,
  method     TEXT,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citizen_actions_user ON citizen_actions(user_id, created_at);

-- Resident app, second round: daily quiz and problem reports join the action log.
ALTER TABLE citizen_actions DROP CONSTRAINT IF EXISTS citizen_actions_kind_check;
ALTER TABLE citizen_actions ADD CONSTRAINT citizen_actions_kind_check CHECK (kind IN ('scan','resin','guide','quiz','report','bag'));

-- A problem a resident reported (overflowing bin, missed collection, dumping, burning). Each one raises an operator alert.
CREATE TABLE IF NOT EXISTS citizen_reports (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('overflowing_bin','missed_collection','dumping','burning','other')),
  zone       TEXT NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  note       TEXT,
  image_key  TEXT,
  alert_id   INT REFERENCES alerts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citizen_reports_user ON citizen_reports(user_id, created_at);
