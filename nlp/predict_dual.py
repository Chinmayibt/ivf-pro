from pathlib import Path

import joblib
import pandas as pd

from extractor import process_input

ROOT = Path(__file__).resolve().parents[1]

# model paths from training scripts
MODEL_A_PATH = ROOT / "model" / "models" / "model_clinical.pkl"
MODEL_B_PATH = ROOT / "model" / "models" / "model_hormonal.pkl"

# NLP feature name -> training column name mapping
COLUMN_MAP = {
    "age": "Patient age at treatment",
    "amh": "AMH level",
    "fsh": "FSH level",
    "bmi": "BMI",
    "cycle_number": "Number of previous IVF cycles",
    "endometrial_thickness": "Endometrial thickness",
    "embryo_grade": "Embryo quality",
}


def _load_model(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Missing model file: {path}")
    return joblib.load(path)


def _to_dataframe(features):
    mapped = {COLUMN_MAP.get(k, k): v for k, v in features.items()}
    return pd.DataFrame([mapped])


def _align_to_model_columns(model, frame: pd.DataFrame):
    expected = getattr(model, "feature_names_in_", None)
    if expected is None:
        return frame
    return frame.reindex(columns=expected, fill_value=pd.NA)


def predict(source):
    result = process_input(source)
    features = result["features"]

    model_a = _load_model(MODEL_A_PATH)
    model_b = _load_model(MODEL_B_PATH)

    frame = _to_dataframe(features)
    x_a = _align_to_model_columns(model_a, frame)
    x_b = _align_to_model_columns(model_b, frame)

    # predict
    prob_a = model_a.predict_proba(x_a)[0][1]
    prob_b = model_b.predict_proba(x_b)[0][1]

    return {
        "model_a_probability": float(prob_a),
        "model_b_probability": float(prob_b),
        "final_prediction": (prob_a + prob_b) / 2,
        "features": features
    }


if __name__ == "__main__":
    output = predict(ROOT / "data" / "raw" / "ivf_dummy_report.pdf")

    print("\n=== FINAL OUTPUT ===")
    print(output)
