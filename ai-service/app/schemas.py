from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Stream = Literal["organic", "plastic", "paper", "metal", "other"]


class SourceIn(BaseModel):
    id: int
    business_type: str
    waste_type: str
    avg_daily_kg: float = Field(gt=0)


class HistoryPoint(BaseModel):
    date: str
    kg: float = Field(ge=0)


class ForecastIn(BaseModel):
    source: SourceIn
    history: list[HistoryPoint] = []
    horizon: int = Field(default=7, ge=1, le=30)


class MixItem(BaseModel):
    business_type: str
    kg: float = Field(gt=0)
    name: Optional[str] = None
    source_id: Optional[int] = None


class ClassifyIn(BaseModel):
    total_kg: float = Field(gt=0)
    month: int = Field(ge=1, le=12)
    moisture_pct: Optional[float] = None
    source_mix: list[MixItem] = Field(min_length=1)
    # Base64-encoded photos of randomly sampled items from the load (sample audit), max 20.
    images: list[str] = Field(default_factory=list, max_length=20)


class ClassifyImageIn(BaseModel):
    images: list[str] = Field(min_length=1, max_length=20)


class PathwayIn(BaseModel):
    stream: Stream
    kg: float = Field(gt=0)
    moisture_pct: Optional[float] = None
    month: int = Field(ge=1, le=12)
    available_technologies: list[str] = []


class FacilityIn(BaseModel):
    id: int
    code: str
    label: str
    name: str
    technology: str
    lat: float
    lng: float
    efficiency_pct: float
    utilization_pct: float
    capacity_tpd: float
    compatibility_pct: float
    max_moisture_pct: Optional[float] = None
    carbon_intensity: Optional[float] = None
    gate_fee_inr_per_t: Optional[float] = None
    status: str = "online"
    n_history: int = 0
    historical_yield_kwh_per_kg: Optional[float] = None
    distance_km: float
    transport_cost_inr: float
    transport_co2_kg: float


class Weights(BaseModel):
    energy: float
    efficiency: float
    compatibility: float
    capacity: float
    transport_cost: float
    carbon: float
    distance: float


class Origin(BaseModel):
    lat: float
    lng: float
    name: Optional[str] = None


class RankIn(BaseModel):
    stream: Stream
    kg: float = Field(gt=0)
    moisture_pct: float
    month: int = Field(ge=1, le=12)
    origin: Origin
    facilities: list[FacilityIn] = Field(min_length=1)
    weights: Weights


class Depot(BaseModel):
    id: int
    name: str
    lat: float
    lng: float


class VehicleIn(BaseModel):
    id: int
    code: str
    capacity_kg: float = Field(gt=0)
    current_load_kg: float = 0
    fuel_l_per_km: float = 0


class StopIn(BaseModel):
    id: int
    name: str
    lat: float
    lng: float
    demand_kg: float = Field(gt=0)
    urgency: str = "normal"
    window_start_min: float = 0
    window_end_min: float = 600


class RoutesIn(BaseModel):
    depot: Depot
    vehicles: list[VehicleIn] = Field(min_length=1, max_length=50)
    stops: list[StopIn] = Field(min_length=1, max_length=200)
    road_factor: float = 1.25
    speed_kmh: float = 28


class RunIn(BaseModel):
    run_id: int
    model_key: Literal["forecast", "classifier", "energy"]


class TrainIn(BaseModel):
    runs: list[RunIn] = Field(min_length=1)


class ChatMsg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AssistantIn(BaseModel):
    messages: list[ChatMsg] = Field(min_length=1)
    user: dict = {}
