"""WattCycle AI service (FastAPI).

All AI/ML runs here: forecasting, composition classification, energy-yield
prediction, facility ranking, OR-Tools routing, training and the assistant.
It is stateless apart from versioned model artifacts; the Node.js API owns the
database and calls this service with a shared service key."""
from __future__ import annotations

import base64
import binascii
import hmac
import threading
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from app import assistant
from app.config import SERVICE_KEY
from app.schemas import (AssistantIn, ClassifyImageIn, ClassifyIn, DesignPackIn, FadeUpdateIn, ForecastIn, GradeIn, PathwayIn, PlanIn, RankIn,
                         RoutesIn, TrainIn, UpcycleMatchIn)
from ml.circular import battery, upcycle
from ml.inference import detect, predict, vision
from ml.inference.predict import ModelNotReady
from ml.models import registry
from ml.optimization import city_plan, ranking, routing
from ml.pipelines import train as training

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Both models import torch. Two threads importing it at once can see a half-initialised module
    # ("partially initialized module 'torch.utils'"), so load them one after the other on ONE thread.
    def warm_models():
        vision.warm_up(background=False)
        detect.warm_up(background=False)
    threading.Thread(target=warm_models, name="model-warm-up", daemon=True).start()
    yield


app = FastAPI(title="WattCycle AI Service", version="1.0.0", lifespan=lifespan)


def service_auth(x_service_key: str = Header(default="")):
    if not hmac.compare_digest(x_service_key.encode(), SERVICE_KEY.encode()):
        raise HTTPException(401, "invalid service key")


MAX_IMAGE_BYTES = 8 * 1024 * 1024


def _decode_images(items: list[str]) -> list[bytes]:
    out = []
    for s in items:
        try:
            b = base64.b64decode(s, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(400, "images must be base64")
        if len(b) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "image larger than 8 MB")
        out.append(b)
    return out


@app.exception_handler(vision.VisionUnavailable)
async def vision_missing(_req: Request, exc: Exception):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(detect.DetectorUnavailable)
async def detector_missing(_req: Request, exc: Exception):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(ModelNotReady)
async def not_ready(_req: Request, exc: ModelNotReady):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.middleware("http")
async def timing(request: Request, call_next):
    t = time.perf_counter()
    resp = await call_next(request)
    resp.headers["x-inference-ms"] = f"{(time.perf_counter() - t) * 1000:.1f}"
    return resp


@app.get("/health")
def health():
    return {"status": "ok", "assistant": assistant.provider_info(), "artifacts": registry.remote_info(), "models": {**registry.status(), "vision": {"loaded": vision.available(), "version": vision.MODEL_ID if vision.available() else None, "algorithm": vision.info()["architecture"]}, "detector": detect.info()}}


@app.post("/v1/forecast", dependencies=[Depends(service_auth)])
def forecast(body: ForecastIn):
    return predict.forecast(body.source.model_dump(), [h.model_dump() for h in body.history], body.horizon)


@app.post("/v1/classify", dependencies=[Depends(service_auth)])
async def classify(body: ClassifyIn):
    imgs = _decode_images(body.images) if body.images else None
    return await run_in_threadpool(predict.classify, body.total_kg, body.month, [m.model_dump() for m in body.source_mix], imgs)


@app.post("/v1/classify-image", dependencies=[Depends(service_auth)])
async def classify_image(body: ClassifyImageIn):
    """Per-photo item + stream prediction (no load composition)."""
    return {"model": vision.MODEL_ID, "photos": await run_in_threadpool(vision.classify_images, _decode_images(body.images))}


@app.post("/v1/detect-waste", dependencies=[Depends(service_auth)])
async def detect_waste(body: ClassifyImageIn):
    """Every piece of waste in each photo, boxed and labelled (YOLOv8, ml/models/best.pt)."""
    try:
        photos = await run_in_threadpool(detect.detect_and_name, _decode_images(body.images), vision.classify_images if vision.available() else None)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"model": detect.MODEL_ID, "photos": photos}


@app.post("/v1/predict-energy", dependencies=[Depends(service_auth)])
def predict_energy(body: PathwayIn):
    return predict.pathways(body.stream, body.kg, body.moisture_pct if body.moisture_pct is not None else (78 if body.stream == "organic" else 20), body.month, body.available_technologies)


@app.post("/v1/rank-facilities", dependencies=[Depends(service_auth)])
def rank(body: RankIn):
    return ranking.rank(body.stream, body.kg, body.moisture_pct, body.month, [f.model_dump() for f in body.facilities], body.weights.model_dump())


@app.post("/v1/optimize-routes", dependencies=[Depends(service_auth)])
async def optimize_routes(body: RoutesIn):
    return await run_in_threadpool(routing.optimize, body.depot.model_dump(), [v.model_dump() for v in body.vehicles], [s.model_dump() for s in body.stops],
                                   body.road_factor, body.speed_kmh, 2, body.distance_matrix_km, body.duration_matrix_min, body.distance_source)


@app.post("/v1/plan-city", dependencies=[Depends(service_auth)])
async def plan_city(body: PlanIn):
    return await run_in_threadpool(city_plan.plan, [z.model_dump() for z in body.zones], [f.model_dump() for f in body.facilities], body.dist)


@app.post("/v1/circular/upcycle-match", dependencies=[Depends(service_auth)])
def upcycle_match(body: UpcycleMatchIn):
    return upcycle.match(body.category, body.kg, [p.model_dump() for p in body.partners])


@app.post("/v1/batteries/grade", dependencies=[Depends(service_auth)])
def battery_grade(body: GradeIn):
    return battery.grade([u.model_dump() for u in body.units], body.fade_priors)


@app.post("/v1/batteries/design-pack", dependencies=[Depends(service_auth)])
async def battery_design(body: DesignPackIn):
    try:
        return await run_in_threadpool(battery.design_pack, [u.model_dump() for u in body.units], body.application, body.target_kwh)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/v1/batteries/update-fade", dependencies=[Depends(service_auth)])
def battery_fade(body: FadeUpdateIn):
    return battery.update_fade(body.chemistry, body.prior_fade, body.prior_n, [p.model_dump() for p in body.packs])


@app.get("/v1/batteries/reference", dependencies=[Depends(service_auth)])
def battery_reference():
    return {"chemistries": {k: {kk: vv for kk, vv in v.items()} for k, v in battery.CHEM.items()}, "applications": battery.APPLICATIONS,
            "eol_soh": battery.EOL_SOH, "grades": {"A": battery.GRADE_A_SOH, "B": battery.GRADE_B_SOH}}


@app.post("/v1/train", dependencies=[Depends(service_auth)], status_code=202)
def train(body: TrainIn):
    training.start_background([r.model_dump() for r in body.runs])
    return {"accepted": len(body.runs)}


@app.post("/v1/assistant/chat", dependencies=[Depends(service_auth)])
async def chat(body: AssistantIn):
    return await run_in_threadpool(assistant.chat, [m.model_dump() for m in body.messages], body.user)
