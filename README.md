# WattCycle — Turn Every Waste Stream Into Its Highest-Value Energy Destination

Closed loop: DISCOVER → COLLECT → CHARACTERIZE → PREDICT → OPTIMIZE → ROUTE → CONVERT → MEASURE → LEARN.

| Part | Stack | Port |
|---|---|---|
| `server/` | Node.js · Express 5 · TypeScript · PostgreSQL (embedded PGlite locally, `DATABASE_URL` for RDS) · JWT/RBAC · WebSockets · audit log · event bus | 4000 |
| `ai-service/` | Python · FastAPI · LightGBM · scikit-learn · OR-Tools · Anthropic SDK (assistant) | 8000 |
| `frontend/` | Next.js 16 · React 19 · Tailwind 4 · Recharts · MapLibre · TanStack Query · Zustand | 3000 |

## Run locally

```bash
cd server && npm install && npx tsx src/index.ts          # seeds the demo network on first start
cd ai-service && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
cd ai-service && .venv/Scripts/python -m uvicorn app.main:app --port 8000
cd frontend && npm install && npm run dev
```

The API's scheduler bootstrap-trains all three models through the AI service (~15 s). Open http://localhost:3000, sign in with a demo role (password `demo1234`), and press **Run Full Optimization**.

Optional: set `ANTHROPIC_API_KEY` for the AI service so WattCycle Intelligence answers with Claude (`claude-opus-5-5`, tool use against `/internal/tools/*`). Without it, an offline router answers from the same data tools.

## Honesty notes
- Every network record is **simulated** (`is_simulated`, labelled in the UI). The physical simulator (`server/src/database/simulator.ts`) stands in for trucks and meters. The ML models only ever see database records.
- The composition "classifier" is a tabular model. No vision model is deployed, because no labelled image dataset exists.
- The energy model uses LightGBM. XGBoost 3.x segfaults on CPython 3.14/Windows; set `ENERGY_BACKEND=xgboost` on Linux.
- XGBoost is only an option because of that crash; everything else listed in the spec is implemented as described.

## Reset
`cd server && npx tsx src/database/seed.ts --reset`
