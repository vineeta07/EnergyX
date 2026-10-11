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
    drive_min: Optional[float] = None
    distance_source: Optional[str] = None
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
    # Optional real road-network matrices (depot first, then stops) — e.g. OSRM / Amazon Location.
    distance_matrix_km: Optional[list[list[float]]] = None
    duration_matrix_min: Optional[list[list[float]]] = None
    distance_source: Optional[str] = None


class PlanZone(BaseModel):
    name: str
    tpd: float = Field(gt=0)
    current_destinations: list[str] = []


class PlanFacility(BaseModel):
    code: str
    label: str
    technology: str
    status: str
    capacity_tpd: float = Field(ge=0)
    kwh_per_t: float = Field(ge=0)


class PlanIn(BaseModel):
    zones: list[PlanZone] = Field(min_length=1, max_length=300)
    facilities: list[PlanFacility] = Field(min_length=1, max_length=200)
    dist: dict[str, dict[str, float]]


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


# ------------------------------------------------------------------ circular economy
UpcycleCategory = Literal["textile", "glass_container", "pet_bottle", "hdpe_container", "cardboard"]
Chemistry = Literal["li_nmc", "li_lfp", "lead_acid"]


class PartnerIn(BaseModel):
    id: int
    name: str
    status: str = "active"
    prices: dict[str, float] = {}
    capacity_kg_week: float = Field(ge=0)
    load_kg_week: float = 0
    received_kg: float = 0
    accepted_kg: float = 0
    distance_km: float = Field(ge=0)
    transport_cost_inr: float = 0
    transport_co2_kg: float = 0


class UpcycleMatchIn(BaseModel):
    category: UpcycleCategory
    kg: float = Field(gt=0, le=100_000)
    partners: list[PartnerIn] = Field(max_length=200)


class BatteryUnitIn(BaseModel):
    id: int
    chemistry: Chemistry
    nominal_v: float = Field(gt=0, le=1000)
    nominal_ah: float = Field(gt=0, le=2000)
    measured_ah: float = Field(ge=0, le=2000)
    ir_mohm: float = Field(gt=0, le=100_000)
    voltage: Optional[float] = Field(default=None, ge=0, le=1000)
    swelling: bool = False
    leakage: bool = False
    ir_ref_mohm: Optional[float] = None


class GradeIn(BaseModel):
    units: list[BatteryUnitIn] = Field(min_length=1, max_length=5000)
    fade_priors: dict[str, float] = {}


class GradedUnitIn(BaseModel):
    id: int
    chemistry: Chemistry
    nominal_v: float
    nominal_ah: float
    measured_ah: float
    ir_mohm: float
    soh: float
    grade: Literal["A", "B", "R"]
    fade_per_cycle: float


class DesignPackIn(BaseModel):
    units: list[GradedUnitIn] = Field(min_length=1, max_length=2000)
    application: Literal["solar_storage_48v", "erickshaw_48v", "streetlight_12v", "telecom_48v"]
    target_kwh: Optional[float] = Field(default=None, gt=0, le=1000)


class FadePoint(BaseModel):
    cycles: float = Field(ge=0)
    soh: float = Field(ge=0, le=1.5)


class FadePack(BaseModel):
    id: int
    predicted_fade: Optional[float] = None
    points: list[FadePoint]


class FadeUpdateIn(BaseModel):
    chemistry: Chemistry
    prior_fade: float = Field(gt=0)
    prior_n: float = Field(default=5.0, gt=0)
    packs: list[FadePack]
