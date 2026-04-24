import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier


RANDOM_STATE = 42
ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "processed" / "ivf_final_dataset.csv"
FALLBACK_DATA_PATH = ROOT / "data" / "processed" / "ivf_final_dataset (2).csv"
MODELS_DIR = ROOT / "models"
METRICS_PATH = MODELS_DIR / "metrics_model_b.json"
MODEL_PATH = MODELS_DIR / "model_hormonal.pkl"


def inject_missing(X, missing_rate=0.05, random_state=42):
    np.random.seed(random_state)
    X = X.copy()

    for col in X.columns:
        mask = np.random.rand(len(X)) < missing_rate
        X.loc[mask, col] = np.nan

    return X


def build_features(df):
    frame = df.copy()
    frame = frame.drop_duplicates()

    frame["fsh"] = pd.to_numeric(frame["fsh"], errors="coerce")
    frame["amh"] = pd.to_numeric(frame["amh"], errors="coerce")

    frame["age_amh"] = frame["age"] * frame["amh"]
    frame["age_fsh"] = frame["age"] * frame["fsh"]
    frame["amh_fsh_ratio"] = frame["amh"] / (frame["fsh"].replace(0, np.nan))
    frame["bmi_age"] = frame["bmi"] * frame["age"]
    frame["embryo_age"] = frame["embryo_grade"] * frame["age"]
    frame["age2"] = frame["age"] ** 2
    frame["amh2"] = frame["amh"] ** 2
    frame["fsh2"] = frame["fsh"] ** 2
    frame["endo_age"] = frame["endometrial_thickness"] * frame["age"]
    frame["endo_amh"] = frame["endometrial_thickness"] * frame["amh"]
    frame["cycle_embryo"] = frame["cycle_number"] * frame["embryo_grade"]
    frame["amh_minus_fsh"] = frame["amh"] - (0.2 * frame["fsh"])

    for col in ["age", "amh", "fsh", "bmi", "endometrial_thickness"]:
        valid = frame[col].dropna()
        if len(valid) > 0:
            quantiles = np.quantile(valid, [0.1, 0.25, 0.5, 0.75, 0.9])
            frame[f"{col}_qbin"] = np.digitize(frame[col].fillna(np.nanmedian(valid)), quantiles)
        else:
            frame[f"{col}_qbin"] = 0

    return frame


def run():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    data_path = DATA_PATH if DATA_PATH.exists() else FALLBACK_DATA_PATH
    raw = pd.read_csv(data_path)
    if "outcome" not in raw.columns:
        raise ValueError(f"Column 'outcome' not found. Available: {list(raw.columns)}")
    y = raw["outcome"].astype(int)
    X = build_features(raw.drop(columns=["outcome"]))

    X_train, X_holdout, y_train, y_holdout = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    # Inject missing only in training
    X_train = inject_missing(X_train, missing_rate=0.05)

    numeric_cols = X_train.select_dtypes(include=["number", "bool"]).columns.tolist()
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imputer", SimpleImputer(strategy="median"))]), numeric_cols),
        ]
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    scale_pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)

    xgb_pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "model",
                XGBClassifier(
                    eval_metric="logloss",
                    random_state=RANDOM_STATE,
                    n_jobs=1,
                    tree_method="hist",
                    scale_pos_weight=scale_pos_weight,
                ),
            ),
        ]
    )
    xgb_search = RandomizedSearchCV(
        estimator=xgb_pipeline,
        param_distributions={
            "model__n_estimators": [300, 500, 800, 1200],
            "model__max_depth": [2, 3, 4, 5, 6],
            "model__learning_rate": [0.01, 0.02, 0.03, 0.05],
            "model__subsample": [0.7, 0.8, 0.9, 1.0],
            "model__colsample_bytree": [0.7, 0.8, 0.9, 1.0],
            "model__min_child_weight": [1, 3, 5, 7],
            "model__reg_lambda": [1.0, 3.0, 8.0, 12.0],
            "model__reg_alpha": [0.0, 0.2, 1.0],
            "model__gamma": [0.0, 0.1, 0.3, 0.6],
        },
        n_iter=12,
        cv=cv,
        scoring="roc_auc",
        random_state=RANDOM_STATE,
        n_jobs=1,
        verbose=1,
    )
    xgb_search.fit(X_train, y_train)

    hgb_pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "model",
                HistGradientBoostingClassifier(
                    max_iter=500, learning_rate=0.03, max_depth=5, random_state=RANDOM_STATE
                ),
            ),
        ]
    )
    hgb_search = RandomizedSearchCV(
        estimator=hgb_pipeline,
        param_distributions={
            "model__max_depth": [3, 4, 5, 6, 8],
            "model__max_iter": [300, 500, 700, 900],
            "model__learning_rate": [0.01, 0.02, 0.03, 0.05],
            "model__min_samples_leaf": [10, 20, 30, 50],
            "model__l2_regularization": [0.0, 0.1, 0.5, 1.0],
        },
        n_iter=8,
        cv=cv,
        scoring="roc_auc",
        random_state=RANDOM_STATE,
        n_jobs=1,
        verbose=1,
    )
    hgb_search.fit(X_train, y_train)

    rf_pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=700,
                    max_depth=8,
                    min_samples_leaf=4,
                    random_state=RANDOM_STATE,
                    class_weight="balanced_subsample",
                    n_jobs=1,
                ),
            ),
        ]
    )
    rf_pipeline.fit(X_train, y_train)

    candidates = [
        ("xgboost", xgb_search.best_estimator_, float(xgb_search.best_score_)),
        ("hist_gradient_boosting", hgb_search.best_estimator_, float(hgb_search.best_score_)),
    ]
    rf_holdout = roc_auc_score(y_holdout, rf_pipeline.predict_proba(X_holdout)[:, 1])
    candidates.append(("random_forest", rf_pipeline, float(rf_holdout)))
    winner_name, winner_model, winner_cv = max(candidates, key=lambda x: x[2])

    holdout_probs = winner_model.predict_proba(X_holdout)[:, 1]
    holdout_auc = roc_auc_score(y_holdout, holdout_probs)
    holdout_pr_auc = average_precision_score(y_holdout, holdout_probs)

    joblib.dump(winner_model, MODEL_PATH)

    metrics = {
        "dataset": str(data_path),
        "winner_model": winner_name,
        "winner_cv_auc": float(winner_cv),
        "holdout_auc": float(holdout_auc),
        "holdout_pr_auc": float(holdout_pr_auc),
        "xgboost_cv_auc": float(xgb_search.best_score_),
        "hist_gradient_boosting_cv_auc": float(hgb_search.best_score_),
        "random_forest_holdout_auc": float(rf_holdout),
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    run()