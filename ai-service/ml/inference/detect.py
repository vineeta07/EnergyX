"""Multi-item waste detector: finds and boxes every piece of waste in one photo.

Model: YOLOv8-large (ml/models/best.pt) from the Recycl.ai project (VSHacks 2023), trained on
4.6k annotated photos. Its five classes are read from the checkpoint itself:

    Crinkly Plastic · Deposit_Recycle · Green_bin · Metallic Wrapping · Recycle

They are Canadian bin categories, not plastic resin codes: the model does not read the number in
the triangle. The Node.js API turns each class into Delhi guidance (bin, verdict, the plastic codes
such items usually carry). Where the 30-class classifier in vision.py names ONE item, this finds
several at once, which is what a household bag or bin looks like.
"""
from __future__ import annotations

import io
import os
import threading
from pathlib import Path

MODEL_PATH = Path(os.getenv("DETECT_MODEL_PATH", Path(__file__).resolve().parents[1] / "models" / "best.pt"))
MODEL_ID = "Recycl.ai YOLOv8l (VSHacks 2023)"
IMG_SIZE = 640

_lock = threading.Lock()
_model = None
_error: str | None = None


class DetectorUnavailable(Exception):
    pass


def _load():
    global _model, _error
    with _lock:
        if _model is not None:
            return _model
        if not MODEL_PATH.exists():
            _error = f"detector weights not found at {MODEL_PATH}"
            raise DetectorUnavailable(_error)
        try:
            from ultralytics import YOLO  # heavy import, only when the detector is first used
        except ImportError:
            _error = "the ultralytics package is not installed"
            raise DetectorUnavailable(_error)
        try:
            _model = YOLO(str(MODEL_PATH))
        except Exception as e:  # a corrupt or incompatible checkpoint must not take the service down
            _error = f"could not load {MODEL_PATH.name}: {type(e).__name__}: {e}"
            raise DetectorUnavailable(_error)
        _error = None
        return _model


def warm_up():
    """Load in the background at start-up so the first photo does not wait for it."""
    def run():
        try:
            _load()
        except DetectorUnavailable as e:
            print(f"[detect] not available: {e}")
    threading.Thread(target=run, daemon=True).start()


def info() -> dict:
    return {"model": MODEL_ID, "loaded": _model is not None, "error": _error,
            "classes": list(_model.names.values()) if _model is not None else None}


def detect(images: list[bytes], conf: float = 0.35, iou: float = 0.5, max_det: int = 30) -> list[dict]:
    """One result per photo: boxes as fractions of the image (x1, y1, x2, y2), most confident first."""
    from PIL import Image, ImageOps

    model = _load()
    out = []
    for raw in images:
        try:
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
        except Exception:
            raise ValueError("could not read the image")
        with _lock:  # one prediction at a time; the model object is not thread-safe
            res = model.predict(img, imgsz=IMG_SIZE, conf=conf, iou=iou, max_det=max_det, verbose=False)[0]
        names = res.names
        dets = []
        for xyxyn, c, p in zip(res.boxes.xyxyn.tolist(), res.boxes.cls.tolist(), res.boxes.conf.tolist()):
            dets.append({"label": names[int(c)], "p": round(float(p), 4), "box": [round(float(v), 4) for v in xyxyn]})
        dets.sort(key=lambda d: -d["p"])
        out.append({"width": img.width, "height": img.height, "detections": dets, "_img": img})
    return out


def crop(img, box: list[float], pad: float = 0.08) -> bytes:
    """The boxed item with a little margin, as JPEG, for the single-item classifier."""
    w, h = img.size
    x1, y1, x2, y2 = box
    dx, dy = (x2 - x1) * pad, (y2 - y1) * pad
    c = img.crop((max(0, (x1 - dx) * w), max(0, (y1 - dy) * h), min(w, (x2 + dx) * w), min(h, (y2 + dy) * h)))
    buf = io.BytesIO()
    c.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def detect_and_name(images: list[bytes], classify=None) -> list[dict]:
    """Detector finds the items; the 30-class classifier (vision.py), when installed, names each boxed item.

    The detector's five Canadian categories are broad and it confuses brown cardboard with foil wrappers,
    so every box also gets the classifier's top guess for the crop. The API decides which answer to show.
    """
    photos = detect(images)
    for ph in photos:
        img = ph.pop("_img")
        if classify is None or not ph["detections"]:
            continue
        try:
            named = classify([crop(img, d["box"]) for d in ph["detections"]])
        except Exception as e:  # the classifier is optional; boxes still come back without names
            print(f"[detect] naming skipped: {type(e).__name__}: {e}")
            continue
        for d, n in zip(ph["detections"], named):
            top = n["top"][0]
            d["item"] = {"label": top["label"], "p": top["p"]}
    return photos
