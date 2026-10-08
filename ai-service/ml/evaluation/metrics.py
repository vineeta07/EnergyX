from __future__ import annotations

import numpy as np
from sklearn.metrics import f1_score, mean_absolute_error, mean_squared_error, precision_score, r2_score, recall_score, accuracy_score


def regression(y_true, y_pred) -> dict:
    y_true, y_pred = np.asarray(y_true, float), np.asarray(y_pred, float)
    nz = np.abs(y_true) > 1e-6
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
        "mape": float(np.mean(np.abs((y_true[nz] - y_pred[nz]) / y_true[nz]))) if nz.any() else None,
        "n": int(len(y_true)),
    }


def classification(y_true, y_pred) -> dict:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
    }
