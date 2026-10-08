import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:4000")
SERVICE_KEY = os.getenv("SERVICE_KEY", "dev-service-key")
ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR", ROOT / "ml" / "models" / "artifacts"))
SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_DIR", ROOT / "ml" / "data" / "snapshots"))
# In AWS mode artifacts/snapshots sync to s3://$S3_BUCKET/ml/ and training runs as SageMaker jobs.
S3_BUCKET = os.getenv("S3_BUCKET", "")

ASSISTANT_MODEL = os.getenv("ASSISTANT_MODEL", "claude-opus-5-5")
