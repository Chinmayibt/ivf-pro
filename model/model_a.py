import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier


RANDOM_STATE = 42
ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT.parent / "data" / "processed" / "FertilityTreatmentDataCleaned.csv"
MODELS_DIR = ROOT / "models"
METRICS_PATH = MODELS_DIR / "metrics_model_a.json"
MODEL_PATH = MODELS_DIR / "model_clinical.pkl"


def inject_missing(X, missing_rate=0.05, random_state=42):
    np.random.seed(random_state)
    X = X.copy()

    for col in X.columns:
        mask = np.random.rand(len(X)) < missing_rate
        X.loc[mask, col] = np.nan

    return X


def build_features(df):
    frame = df.copy()
    for key_col in ["Specific treatment type", "Patient ethnicity", "Sperm source", "Egg source"]:
        frame[f"{key_col}__missing"] = frame[key_col].isna().astype(int)

    return frame


def make_preprocessor(X):
    numeric_cols = X.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_cols = [c for c in X.columns if c not in numeric_cols]
    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline([("imputer", SimpleImputer(strategy="median", add_indicator=True))]),
                numeric_cols,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent", add_indicator=True)),
                        ("encoder", OneHotEncoder(handle_unknown="ignore", min_frequency=50)),
                    ]
                ),
                categorical_cols,
            ),
        ]
    )


def run():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    raw = pd.read_csv(DATA_PATH)
    raw = raw.drop_duplicates()
    # Restricting to IVF cohort materially improves signal quality for Model A.
    raw = raw[raw["Specific treatment type"] == "IVF"].copy()
    y = raw["Live birth occurrence"].astype(int)
    X = build_features(raw.drop(columns=["Live birth occurrence"]))

    X_train, X_holdout, y_train, y_holdout = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    # Inject missing only in training
    X_train = inject_missing(X_train, missing_rate=0.05)

    preprocessor = make_preprocessor(X_train)
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
    xgb_params = {
        "model__n_estimators": [400, 500, 700],
        "model__max_depth": [5, 6, 7],
        "model__learning_rate": [0.03, 0.05],
        "model__subsample": [0.85, 0.9, 1.0],
        "model__colsample_bytree": [0.85, 0.9, 1.0],
        "model__min_child_weight": [1, 3, 5],
        "model__reg_lambda": [1.0, 3.0, 6.0],
        "model__reg_alpha": [0.0, 0.2],
        "model__gamma": [0.0, 0.1],
    }
    xgb_search = RandomizedSearchCV(
        estimator=xgb_pipeline,
        param_distributions=xgb_params,
        n_iter=8,
        cv=cv,
        scoring="roc_auc",
        random_state=RANDOM_STATE,
        n_jobs=1,
        verbose=1,
    )
    xgb_search.fit(X_train, y_train)

    rf_pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=500,
                    min_samples_leaf=3,
                    random_state=RANDOM_STATE,
                    n_jobs=1,
                    class_weight="balanced_subsample",
                ),
            ),
        ]
    )
    rf_pipeline.fit(X_train, y_train)

    xgb_fixed = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "model",
                XGBClassifier(
                    n_estimators=500,
                    max_depth=6,
                    learning_rate=0.05,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    eval_metric="logloss",
                    random_state=RANDOM_STATE,
                    n_jobs=1,
                    tree_method="hist",
                    scale_pos_weight=scale_pos_weight,
                ),
            ),
        ]
    )
    fixed_cv = float(cross_val_score(xgb_fixed, X_train, y_train, cv=cv, scoring="roc_auc", n_jobs=1).mean())
    xgb_fixed.fit(X_train, y_train)

    candidates = [
        ("xgboost", xgb_search.best_estimator_, float(xgb_search.best_score_)),
        ("xgboost_fixed", xgb_fixed, fixed_cv),
    ]
    rf_holdout = roc_auc_score(y_holdout, rf_pipeline.predict_proba(X_holdout)[:, 1])
    candidates.append(("random_forest", rf_pipeline, float(rf_holdout)))
    winner_name, winner_model, winner_cv = max(candidates, key=lambda x: x[2])

    holdout_probs = winner_model.predict_proba(X_holdout)[:, 1]
    holdout_auc = roc_auc_score(y_holdout, holdout_probs)
    holdout_pr_auc = average_precision_score(y_holdout, holdout_probs)

    joblib.dump(winner_model, MODEL_PATH)

    metrics = {
        "dataset": str(DATA_PATH),
        "cohort": "Specific treatment type == IVF",
        "winner_model": winner_name,
        "winner_cv_auc": float(winner_cv),
        "holdout_auc": float(holdout_auc),
        "holdout_pr_auc": float(holdout_pr_auc),
        "xgboost_cv_auc": float(xgb_search.best_score_),
        "xgboost_fixed_cv_auc": float(fixed_cv),
        "random_forest_holdout_auc": float(rf_holdout),
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    run()
