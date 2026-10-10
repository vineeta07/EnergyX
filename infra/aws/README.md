# WattCycle on AWS

```
                    ┌──────────────── CloudFront ────────────────┐
 Browser ──────────►│  /*  → Next.js (ECS or Amplify Hosting)     │
                    │  /api/*, /ws → ALB → ECS Fargate: api :4000 │
                    └─────────────────────────────────────────────┘
                                       │ Cloud Map (private)
                                       ▼
   ECS Fargate: ai :8000  (FastAPI — inference, OR-Tools, assistant)
        │  pulls /internal/datasets, posts training callbacks
        ▼
   SageMaker Training Job (same ml/pipelines/train.py) → Model Registry → S3 artifacts
```

| Local component | AWS service | Why it is there |
|---|---|---|
| PGlite (embedded Postgres) | **RDS for PostgreSQL + PostGIS** | Same schema (`server/src/database/schema.sql`), plus `infra/sql/postgis.sql` for radius queries |
| `data/uploads` | **S3** (SSE-KMS, private, presigned GET/PUT) | Waste images, dataset snapshots, model artifacts |
| in-process `cache.ts`, token revocation | **ElastiCache Redis** | Shared cache/rate-limit state across API tasks |
| `services/events.ts` event bus | **EventBridge** bus `wattcycle-domain` | Fan-out of domain events to queues, alarms, analytics |
| `workers/scheduler.ts` timers | **EventBridge Scheduler → SQS** | Nightly retraining, drift-triggered retraining, sweeps |
| `ml/pipelines/train.py` thread | **SageMaker Training + Model Registry** | Versioned, reproducible training on the Linux image |
| great-circle × 1.25 road factor | **Amazon Location Service** route matrix + map style | Real road distances & tiles (`NEXT_PUBLIC_MAP_STYLE`) |
| `workers/fleet.ts` simulator | **IoT Core → Lambda** | Real GPS telemetry and facility meters; same pipeline calls |
| console logs | **CloudWatch** logs, metrics, `EnergyModelRollingMAPE` alarm | Ops + model monitoring |
| `.env` | **Secrets Manager** | JWT secret, service key, Anthropic key, DB URL |

Services deliberately **not** used: Kinesis (event volume is low), DynamoDB (relational data with joins), Step Functions (the pipeline state machine is simple and lives in `pipeline.ts`).

## Event flow (EventBridge detail-types)
`WastePickupRequested → CollectionOptimizationStarted → RouteOptimized → PickupAssigned → VehicleEnRoute → WasteCollected → WasteArrivedAtHub → WasteClassificationCompleted → ClassificationReviewed → EnergyPotentialCalculated → FacilitySelected → DestinationApproved → WasteDispatched → EnergyGenerationCompleted → ActualOutputRecorded → AITrainingDataCreated → ModelRetrainingStarted → ModelRetrained`
