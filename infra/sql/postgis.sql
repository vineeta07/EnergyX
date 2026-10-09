-- PostGIS upgrade for RDS / docker Postgres (not applicable to embedded PGlite).
-- Adds geography columns kept in sync with lat/lng plus GiST indexes, enabling
-- radius queries such as "open pickups within 6 km of this source".
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['waste_sources','processing_hubs','facilities','vehicles','route_stops'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
                    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING GIST (geom)', 'idx_' || t || '_geom', t);
  END LOOP;
END $$;

-- Example: consolidation candidates within 6 km
-- SELECT p.id FROM pickup_requests p JOIN waste_sources s ON s.id = p.source_id
-- WHERE p.status = 'REQUESTED' AND ST_DWithin(s.geom, (SELECT geom FROM waste_sources WHERE id = $1), 6000);
