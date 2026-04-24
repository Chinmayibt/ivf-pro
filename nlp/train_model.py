"""
Train a logistic regression model on structured features from patient case text.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "processed" / "patient_cases.json"
MODEL_DIR = ROOT / "model"
MODEL_PATH = MODEL_DIR / "model.pkl"


def extract_age(text: str) -> int | None:
    """Parse age from phrases like 'aged 32', 'age 36', 'Female age 38'."""
    m = re.search(r"\b(?:aged|age)\s+(\d{1,2})\b", text, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def extract_features(text: str) -> dict:
    t = text.lower()
    return {
        "age": extract_age(text),
        "PCOS": 1 if "pcos" in t else 0,
        "AMH_low": 1 if "low amh" in t else 0,
        "AMH_high": 1 if "high amh" in t else 0,
        "FSH_high": 1 if "high fsh" in t else 0,
        "BMI_high": 1 if ("obese" in t or "high bmi" in t) else 0,
        "endometriosis": 1 if "endometriosis" in t else 0,
        "previous_failures": 1
        if ("failed" in t or "multiple ivf failures" in t)
        else 0,
    }


def extract_outcome(text: str) -> int | None:
    t = text.lower()
    positive = any(
        phrase in t
        for phrase in ("successful", "live birth", "pregnancy achieved")
    )
    negative = any(
        phrase in t for phrase in ("failed", "unsuccessful", "poor outcome")
    )
    if positive and negative:
        return None
    if positive:
        return 1
    if negative:
        return 0
    return None


def load_cases(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def build_dataframe(cases: list[dict]) -> pd.DataFrame:
    rows = []
    for case in cases:
        text = case.get("text", "")
        if not text:
            continue
        outcome = extract_outcome(text)
        if outcome is None:
            continue
        feats = extract_features(text)
        feats["outcome"] = outcome
        rows.append(feats)
    return pd.DataFrame(rows)


def main() -> None:
    cases = load_cases(DATA_PATH)
    df = build_dataframe(cases)
    df = df.dropna()

    feature_cols = [
        "age",
        "PCOS",
        "AMH_low",
        "AMH_high",
        "FSH_high",
        "BMI_high",
        "endometriosis",
        "previous_failures",
    ]
    X = df[feature_cols]
    y = df["outcome"]

    stratify = y if y.nunique() > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Accuracy: {acc:.4f}\n")
    print("Classification report:\n")
    print(
        classification_report(y_test, y_pred, digits=4, zero_division=0)
    )

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}\n")

    # Sample predictions on a few held-out rows
    sample_n = min(3, len(X_test))
    if sample_n > 0:
        sample_X = X_test.head(sample_n)
        sample_y = y_test.loc[sample_X.index]
        sample_pred = model.predict(sample_X)
        sample_proba = model.predict_proba(sample_X)[:, 1]
        print("Sample predictions (test rows):")
        for i, idx in enumerate(sample_X.index):
            print(
                f"  idx={idx} true={sample_y.loc[idx]} "
                f"pred={sample_pred[i]} P(outcome=1)={sample_proba[i]:.4f}"
            )


if __name__ == "__main__":
    main()
