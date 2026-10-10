"""Waste image classifier — pretrained EfficientNetB0 (Darshan764/waste-classification-v2).

30 item classes trained on the real Kaggle "Recyclable and Household Waste
Classification" photos (15k images, 87.3% val accuracy per the model card).
Runs on Keras 3 with the PyTorch backend (TensorFlow has no stable wheel for
CPython 3.14); the .weights.h5 file is backend-independent.

The model classifies ONE item per photo. To estimate the composition of a
whole load we treat photos of randomly sampled items as a sample audit and
combine them with the tabular prior (see ml/inference/predict.classify).
"""
from __future__ import annotations

import io
import json
import os
import threading
from pathlib import Path

os.environ.setdefault("KERAS_BACKEND", "torch")

import numpy as np

MODEL_DIR = Path(os.getenv("VISION_MODEL_DIR", Path(__file__).resolve().parents[1] / "models" / "pretrained" / "waste-classification-v2"))
MODEL_ID = "Darshan764/waste-classification-v2"
INPUT_SIZE = 224

# Alphabetical order = keras image_dataset_from_directory label order (matches the model card list).
CLASSES = [
    "aerosol_cans", "aluminum_food_cans", "aluminum_soda_cans", "cardboard_boxes", "cardboard_packaging", "clothing",
    "coffee_grounds", "disposable_plastic_cutlery", "eggshells", "food_waste", "glass_beverage_bottles",
    "glass_cosmetic_containers", "glass_food_jars", "magazines", "newspaper", "office_paper", "paper_cups",
    "plastic_cup_lids", "plastic_detergent_bottles", "plastic_food_containers", "plastic_shopping_bags",
    "plastic_soda_bottles", "plastic_straws", "plastic_trash_bags", "plastic_water_bottles", "shoes",
    "steel_food_cans", "styrofoam_cups", "styrofoam_food_containers", "tea_bags",
]

# Item class -> WattCycle waste stream (energy / recovery pathway).
STREAM_OF = {
    **{c: "organic" for c in ("coffee_grounds", "eggshells", "food_waste", "tea_bags")},
    **{c: "plastic" for c in ("disposable_plastic_cutlery", "plastic_cup_lids", "plastic_detergent_bottles", "plastic_food_containers",
                              "plastic_shopping_bags", "plastic_soda_bottles", "plastic_straws", "plastic_trash_bags",
                              "plastic_water_bottles", "styrofoam_cups", "styrofoam_food_containers")},
    **{c: "paper" for c in ("cardboard_boxes", "cardboard_packaging", "magazines", "newspaper", "office_paper", "paper_cups")},
    **{c: "metal" for c in ("aerosol_cans", "aluminum_food_cans", "aluminum_soda_cans", "steel_food_cans")},
    **{c: "glass" for c in ("glass_beverage_bottles", "glass_cosmetic_containers", "glass_food_jars")},
    **{c: "textile" for c in ("clothing", "shoes")},
}
VISION_STREAMS = ["organic", "plastic", "paper", "metal", "glass", "textile"]

_lock = threading.Lock()
_model = None


class VisionUnavailable(Exception):
    pass


def available() -> bool:
    return (MODEL_DIR / "config.json").exists() and (MODEL_DIR / "model.weights.h5").exists()


def load():
    """Rebuild the functional graph from config.json and load weights (no pickled code is executed)."""
    global _model
    with _lock:
        if _model is not None:
            return _model
        if not available():
            raise VisionUnavailable(f"Vision model files not found in {MODEL_DIR}. Run: git clone https://huggingface.co/{MODEL_ID} {MODEL_DIR}")
        import keras
        cfg = json.loads((MODEL_DIR / "config.json").read_text(encoding="utf8"))
        model = keras.saving.deserialize_keras_object(cfg)
        model.load_weights(str(MODEL_DIR / "model.weights.h5"))
        out = model.output_shape[-1]
        if out != len(CLASSES):
            raise VisionUnavailable(f"Model outputs {out} classes, expected {len(CLASSES)}")
        _model = model
        return _model


def _prep(image_bytes: bytes) -> np.ndarray:
    from PIL import Image, ImageOps
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB").resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
    # The graph contains EfficientNet's own Rescaling/Normalization, so raw 0–255 floats go in (as on the model card).
    return np.asarray(img, dtype="float32")


def classify_images(images: list[bytes], top_k: int = 3) -> list[dict]:
    """Per-photo item probabilities + stream probabilities."""
    model = load()
    batch = np.stack([_prep(b) for b in images])
    probs = np.asarray(model.predict(batch, verbose=0, batch_size=16), dtype="float64")
    out = []
    for p in probs:
        streams = {s: 0.0 for s in VISION_STREAMS}
        for i, c in enumerate(CLASSES):
            streams[STREAM_OF[c]] += float(p[i])
        top = np.argsort(p)[::-1][:top_k]
        best_stream = max(streams, key=streams.get)
        out.append({
            "top": [{"label": CLASSES[i], "stream": STREAM_OF[CLASSES[i]], "p": round(float(p[i]), 4)} for i in top],
            "streams": {k: round(v, 4) for k, v in streams.items()},
            "stream": best_stream,
            "confidence": round(streams[best_stream], 4),
        })
    return out


def info() -> dict:
    return {"model": MODEL_ID, "architecture": "EfficientNetB0 + head (Keras 3, torch backend)", "classes": len(CLASSES),
            "streams": VISION_STREAMS, "loaded": _model is not None, "available": available()}
