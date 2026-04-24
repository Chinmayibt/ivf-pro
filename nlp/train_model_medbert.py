"""
Train Logistic Regression on structured IVF features plus Bio_ClinicalBERT embeddings.
Runs on CPU only; embeddings use mean-pooled last hidden states.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from transformers import AutoModel, AutoTokenizer

# ---------------------------------------------------------------------------
# Paths and Hugging Face model id
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "processed" / "patient_cases.json"
MODEL_DIR = ROOT / "model"
MODEL_PATH = MODEL_DIR / "model_medbert.pkl"
MODEL_NAME = "emilyalsentzer/Bio_ClinicalBERT"

# Loaded in main(); get_embedding() uses these (CPU tensors).
BERT_TOKENIZER: AutoTokenizer | None = None
BERT_MODEL: AutoModel | None = None

STRUCTURED_KEYS = [
    "age",
    "PCOS",
    "AMH_low",
    "AMH_high",
    "FSH_high",
    "BMI_high",
    "endometriosis",
    "previous_failures",
]


def extract_age(text: str) -> int | None:
    """Parse age from phrases like 'aged 32', 'age 36', 'Female age 38'."""
    m = re.search(r"\b(?:aged|age)\s+(\d{1,2})\b", text, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def extract_features(text: str) -> dict:
    """Rule-based structured features (same logic as train_model.py)."""
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
    """Binary outcome from keywords; skip ambiguous or missing cases."""
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


def get_embedding(text: str) -> np.ndarray:
    """
    Tokenize text, run Bio_ClinicalBERT, mean-pool last_hidden_state (mask-weighted).
    Returns a 1D float32 vector (hidden size, typically 768).
    """
    assert BERT_TOKENIZER is not None and BERT_MODEL is not None

    # Tokenize with truncation for BERT max length; CPU tensors.
    enc = BERT_TOKENIZER(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True,
    )

    with torch.no_grad():
        out = BERT_MODEL(**enc)
        hidden = out.last_hidden_state  # (batch, seq_len, hidden)
        mask = enc["attention_mask"].unsqueeze(-1).float()
        summed = (hidden * mask).sum(dim=1)
        denom = mask.sum(dim=1).clamp(min=1e-9)
        pooled = summed / denom

    return pooled.cpu().numpy().astype(np.float32).squeeze(0)


def build_dataset(cases: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """
    For each labeled case: structured feature vector + MedBERT embedding.
    Drops rows with missing age or unclear outcome (handled before call).
    """
    X_rows: list[np.ndarray] = []
    y_vals: list[int] = []

    for case in cases:
        text = case.get("text", "")
        if not text.strip():
            continue

        # Outcome: only keep rows with a definite 0/1 label (same rules as baseline).
        outcome = extract_outcome(text)
        if outcome is None:
            continue

        # Structured rules: age is required so we can dropna-equivalent filtering.
        feats = extract_features(text)
        if feats["age"] is None:
            continue

        # Flatten structured dict to a fixed-order vector for sklearn.
        struct_vec = np.array(
            [float(feats[k]) for k in STRUCTURED_KEYS], dtype=np.float32
        )

        # MedBERT sentence vector, then concat [structured | embedding].
        emb = get_embedding(text)
        final_input = np.concatenate([struct_vec, emb], axis=0)
        X_rows.append(final_input)
        y_vals.append(int(outcome))

    if not X_rows:
        return np.zeros((0, 0), dtype=np.float32), np.array([], dtype=np.int64)

    X = np.vstack(X_rows)
    y = np.array(y_vals, dtype=np.int64)
    return X, y


def main() -> None:
    global BERT_TOKENIZER, BERT_MODEL

    # Step 1: load patient narratives + labels from processed JSON.
    with DATA_PATH.open(encoding="utf-8") as f:
        cases: list[dict] = json.load(f)

    # Step 2: load Bio_ClinicalBERT tokenizer + encoder on CPU (no GPU).
    torch.set_grad_enabled(False)
    BERT_TOKENIZER = AutoTokenizer.from_pretrained(MODEL_NAME)
    BERT_MODEL = AutoModel.from_pretrained(MODEL_NAME)
    BERT_MODEL.eval()
    BERT_MODEL.to(torch.device("cpu"))

    # Step 3: build X (structured + embedding), y (outcome) as numpy arrays.
    X, y = build_dataset(cases)
    print("Class distribution (labeled rows):\n", pd.Series(y).value_counts(), "\n")
    if len(y) < 2:
        print(
            "Not enough labeled rows after filtering. "
            f"Got n={len(y)}. Need at least 2 for train/test split."
        )
        return

    # Step 4: hold out 20% for evaluation; stratify only if both classes exist.
    stratify = y if len(np.unique(y)) > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    # Step 5: train linear model on high-dimensional combined inputs.
    clf = LogisticRegression(max_iter=1000, random_state=42)
    clf.fit(X_train, y_train)

    # Step 6: accuracy + full per-class metrics.
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Accuracy: {acc:.4f}\n")
    print("Classification report:\n")
    print(classification_report(y_test, y_pred, digits=4, zero_division=0))

    # Step 7: save sklearn weights; at inference time reload HF model + this clf.
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}\n")

    # Step 8: show a few concrete test predictions with calibrated probabilities.
    n_show = min(3, len(X_test))
    if n_show > 0:
        proba = clf.predict_proba(X_test[:n_show])[:, 1]
        print("Sample predictions (first test rows):")
        for i in range(n_show):
            print(
                f"  row={i} true={y_test[i]} pred={y_pred[i]} "
                f"P(outcome=1)={proba[i]:.4f}"
            )


if __name__ == "__main__":
    main()
