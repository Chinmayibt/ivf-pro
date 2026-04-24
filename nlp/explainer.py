"""
Generic explanation module for IVF models (pre/post IVF, sklearn and tree models).
"""
from __future__ import annotations

import re
from pathlib import Path

import joblib
import numpy as np
import shap

try:
    from nlp.input_handler import get_input
except ModuleNotFoundError:
    from input_handler import get_input  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "model" / "model.pkl"

feature_names = [
    "age",
    "PCOS",
    "AMH_low",
    "AMH_high",
    "FSH_high",
    "BMI_high",
    "endometriosis",
    "previous_failures",
]


def extract_age(text: str) -> float:
    match = re.search(r"\b(?:aged|age)\s+(\d{1,2})\b", text, flags=re.IGNORECASE)
    return float(match.group(1)) if match else 0.0


def extract_features(text: str) -> np.ndarray:
    """Extract the base 8 clinical features in fixed order."""
    t = text.lower()
    features = [
        extract_age(text),
        1.0 if "pcos" in t else 0.0,
        1.0 if "low amh" in t else 0.0,
        1.0 if "high amh" in t else 0.0,
        1.0 if "high fsh" in t else 0.0,
        1.0 if ("obese" in t or "high bmi" in t) else 0.0,
        1.0 if "endometriosis" in t else 0.0,
        1.0 if ("failed" in t or "multiple ivf failures" in t) else 0.0,
    ]
    return np.array(features, dtype=np.float32)


def _align_features_to_model(features: np.ndarray, model) -> np.ndarray:
    """
    Ensure feature vector matches model input size.
    - If model expects fewer features: truncate.
    - If model expects more features: right-pad with zeros.
    """
    x = np.array(features, dtype=np.float32).reshape(1, -1)
    expected = getattr(model, "n_features_in_", x.shape[1])
    if x.shape[1] > expected:
        x = x[:, :expected]
    elif x.shape[1] < expected:
        pad = np.zeros((1, expected - x.shape[1]), dtype=np.float32)
        x = np.hstack([x, pad])
    return x


def _predict_probability(model, x: np.ndarray) -> float:
    """Safely get probability-like output across model types."""
    if hasattr(model, "predict_proba"):
        return float(model.predict_proba(x)[0][1])
    pred = model.predict(x)
    return float(np.array(pred).reshape(-1)[0])


def clinical_reasoning(features: np.ndarray) -> list[str]:
    """Rule-based clinical interpretation from base structured features."""
    vals = np.array(features, dtype=np.float32).reshape(-1)
    vals = np.pad(vals, (0, max(0, len(feature_names) - len(vals))), constant_values=0.0)

    age, pcos, amh_low, _, fsh_high, bmi_high, _, prev_fail = vals[:8]
    notes: list[str] = []

    if age > 35:
        notes.append("Advanced maternal age reduces IVF success")
    if amh_low >= 1:
        notes.append("Low AMH indicates reduced ovarian reserve")
    if bmi_high >= 1:
        notes.append("High BMI negatively affects fertilization")
    if pcos >= 1:
        notes.append("PCOS affects hormonal balance and ovulation")
    if fsh_high >= 1:
        notes.append("High FSH suggests reduced ovarian response")
    if prev_fail >= 1:
        notes.append("Previous IVF failures reduce success probability")
    if not notes:
        notes.append("No major rule-based clinical risk factors detected")
    return notes


def _safe_feature_name(idx: int, total: int) -> str:
    if idx < len(feature_names):
        return feature_names[idx]
    return f"feature_{idx}" if idx < total else "unknown_feature"


def _fallback_key_factors(model, x: np.ndarray) -> list[str]:
    """Fallback when SHAP fails."""
    if hasattr(model, "coef_"):
        weights = np.abs(np.array(model.coef_).reshape(-1))
        top = np.argsort(weights)[::-1][:3]
        return [_safe_feature_name(i, x.shape[1]) for i in top]
    if hasattr(model, "feature_importances_"):
        weights = np.abs(np.array(model.feature_importances_).reshape(-1))
        top = np.argsort(weights)[::-1][:3]
        return [_safe_feature_name(i, x.shape[1]) for i in top]
    # Last-resort fallback to first available features.
    return [_safe_feature_name(i, x.shape[1]) for i in range(min(3, x.shape[1]))]


def explain_prediction(features, model, prediction: float) -> dict:
    """
    Generic explanation function.

    Args:
        features: list or np.ndarray of model inputs
        model: trained model (linear/tree/other)
        prediction: probability (float)
    """
    x = _align_features_to_model(np.array(features, dtype=np.float32), model)
    key_factors: list[str]

    try:
        if hasattr(model, "coef_"):
            explainer = shap.LinearExplainer(model, np.zeros((1, x.shape[1]), dtype=np.float32))
            sv = explainer(x)
            shap_vals = np.array(sv.values).reshape(-1)
        elif hasattr(model, "feature_importances_"):
            explainer = shap.TreeExplainer(model)
            sv = explainer(x)
            shap_vals = np.array(sv.values).reshape(-1)
        else:
            # Small background keeps it simple and safe.
            background = np.zeros((1, x.shape[1]), dtype=np.float32)
            explainer = shap.KernelExplainer(model.predict_proba, background)
            sv = explainer.shap_values(x, nsamples=50)
            # For binary classifiers, shap values may come as list[class0, class1].
            if isinstance(sv, list):
                shap_vals = np.array(sv[-1]).reshape(-1)
            else:
                shap_vals = np.array(sv).reshape(-1)

        top_idx = np.argsort(np.abs(shap_vals))[::-1][:3]
        key_factors = [_safe_feature_name(i, x.shape[1]) for i in top_idx]
    except Exception:
        # SHAP failure should never crash the explanation layer.
        key_factors = _fallback_key_factors(model, x)

    return {
        "probability": float(prediction),
        "label": "Success" if float(prediction) > 0.5 else "Failure",
        "key_factors": key_factors,
        "clinical_explanation": clinical_reasoning(np.array(features, dtype=np.float32)),
    }


def explain_from_input(source: str, model) -> dict:
    """
    Wrapper:
      1) clean input text
      2) extract features
      3) predict
      4) explain
    """
    text = get_input(source)
    features = extract_features(text)
    x = _align_features_to_model(features, model)
    prediction = _predict_probability(model, x)
    return explain_prediction(features, model, prediction)


if __name__ == "__main__":
    loaded_model = joblib.load(MODEL_PATH)
    sample = "Female aged 38 with low AMH and high BMI"
    print(explain_from_input(sample, loaded_model))
