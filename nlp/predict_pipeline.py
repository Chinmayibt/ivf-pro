import joblib
import numpy as np
import pandas as pd
import shutil
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from nlp.extractor import process_input
from nlp.llm_explainer import generate_llm_explanation
from kg.ivf_graph import IVFGraph


# ----------------------------
# PATHS
# ----------------------------
ROOT = Path(__file__).resolve().parent.parent

MODEL_A_PATH = ROOT / "model" / "model_a" / "model_clinical.pkl"
MODEL_B_PATH = ROOT / "model" / "model_b" / "model_hormonal.pkl"
FALLBACK_MODEL_A_PATH = ROOT / "model" / "model_a" / "model_clinical_fallback.pkl"
FALLBACK_MODEL_B_PATH = ROOT / "model" / "model_b" / "model_hormonal_fallback.pkl"


# ----------------------------
# LOAD MODELS
# ----------------------------
def _train_fallback_model_a():
    dataset_path = ROOT / "data" / "processed" / "FertilityTreatmentDataCleaned.csv"
    if not dataset_path.exists():
        raise RuntimeError(f"Fallback dataset missing: {dataset_path}")

    raw = pd.read_csv(dataset_path).drop_duplicates()
    if "Live birth occurrence" not in raw.columns:
        raise RuntimeError("Fallback Model A training failed: missing 'Live birth occurrence' column")

    y = raw["Live birth occurrence"].astype(int)
    X = raw.drop(columns=["Live birth occurrence"])
    for key_col in ["Specific treatment type", "Patient ethnicity", "Sperm source", "Egg source"]:
        if key_col in X.columns:
            X[f"{key_col}__missing"] = X[key_col].isna().astype(int)

    X_train, _, y_train, _ = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    numeric_cols = X_train.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_cols = [c for c in X_train.columns if c not in numeric_cols]
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imputer", SimpleImputer(strategy="median"))]), numeric_cols),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("encoder", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical_cols,
            ),
        ]
    )

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=300,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=1,
                    class_weight="balanced_subsample",
                ),
            ),
        ]
    ).fit(X_train, y_train)


def _train_fallback_model_b():
    primary = ROOT / "data" / "processed" / "ivf_final_dataset.csv"
    fallback = ROOT / "data" / "processed" / "ivf_final_dataset (2).csv"
    dataset_path = primary if primary.exists() else fallback
    if not dataset_path.exists():
        raise RuntimeError(f"Fallback dataset missing: {dataset_path}")

    raw = pd.read_csv(dataset_path).drop_duplicates()
    if "outcome" not in raw.columns:
        raise RuntimeError("Fallback Model B training failed: missing 'outcome' column")

    y = raw["outcome"].astype(int)
    X = raw.drop(columns=["outcome"])

    # Keep fallback features aligned with build_model_b_input schema.
    numeric_feature_order = [
        "age",
        "amh",
        "fsh",
        "bmi",
        "endometrial_thickness",
        "cycle_number",
        "embryo_grade",
    ]
    for col in numeric_feature_order:
        if col not in X.columns:
            X[col] = np.nan
    X = X[numeric_feature_order]

    X_train, _, y_train, _ = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=300,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=1,
                    class_weight="balanced_subsample",
                ),
            ),
        ]
    ).fit(X_train, y_train)


def _load_or_train_model(primary_path: Path, fallback_path: Path, train_fn, label: str):
    if fallback_path.exists():
        try:
            model = joblib.load(fallback_path)
            print(f"✅ {label} loaded from persistent fallback")
            return model
        except Exception:
            print(f"⚠️ {label} fallback file unreadable, retraining fallback")

    try:
        model = joblib.load(primary_path)
        print(f"✅ {label} loaded")
        return model
    except Exception:
        print(f"⚠️ {label} legacy model incompatible, training sklearn fallback")
        model = train_fn()
        fallback_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, fallback_path)
        # One-time migration: replace incompatible primary artifact with compatible fallback.
        try:
            legacy_backup = primary_path.with_suffix(primary_path.suffix + ".legacy_xgboost")
            if primary_path.exists() and not legacy_backup.exists():
                shutil.copy2(primary_path, legacy_backup)
            shutil.copy2(fallback_path, primary_path)
            print(f"✅ {label} primary artifact migrated to compatible fallback")
        except Exception as migrate_err:
            print(f"⚠️ {label} fallback migration skipped: {migrate_err}")
        print(f"✅ {label} fallback trained and saved")
        return model


model_a = _load_or_train_model(MODEL_A_PATH, FALLBACK_MODEL_A_PATH, _train_fallback_model_a, "Model A")
model_b = _load_or_train_model(MODEL_B_PATH, FALLBACK_MODEL_B_PATH, _train_fallback_model_b, "Model B")


# ----------------------------
# KNOWLEDGE GRAPH
# ----------------------------
graph = IVFGraph()


# ----------------------------
# FEATURE -> DATAFRAME
# ----------------------------
def safe_num(x):
    return x if x is not None else np.nan


def build_full_model_input(features: dict) -> pd.DataFrame:
    data = {}

    # ---------------- AGE ----------------
    age = safe_num(features.get("age"))

    # Handle missing age safely
    if age is None or (isinstance(age, float) and np.isnan(age)):
        data["Patient age at treatment"] = np.nan
        data["Patient/Egg provider age"] = "Unknown"
        data["Partner/Sperm provider age"] = "Unknown"
    else:
        data["Patient age at treatment"] = age

        if age is not None and not pd.isna(age) and age < 35:
            age_group = "18-34"
        elif age is not None and not pd.isna(age) and age < 40:
            age_group = "35-39"
        else:
            age_group = "40-42"

        data["Patient/Egg provider age"] = age_group
        data["Partner/Sperm provider age"] = age_group

    # ---------------- TREATMENT ----------------
    data["Specific treatment type"] = features.get("treatment", "ICSI")
    data["Egg source"] = features.get("egg_source", "Patient")
    data["Sperm source"] = features.get("sperm_source", "Partner")

    # ---------------- CYCLE INFO ----------------
    data["Total number of previous IVF cycles"] = features.get("cycle_number", 1)

    # ---------------- EMBRYO / EGGS ----------------
    def _nan_if_none(x):
        return np.nan if x is None else x

    data["Fresh eggs collected"] = _nan_if_none(features.get("total_eggs"))
    data["Total eggs mixed"] = _nan_if_none(features.get("total_eggs"))
    data["Total embryos created"] = _nan_if_none(features.get("embryos_created"))
    data["Embryos transferred"] = _nan_if_none(features.get("embryos_transferred"))
    data["Total embryos thawed"] = np.nan

    # ---------------- DATE ----------------
    data["Date of embryo transfer"] = "2024-01-01"  # dummy valid value

    # ---------------- ETHNICITY ----------------
    data["Patient ethnicity"] = "Unknown"

    # ---------------- MODEL B EXTRA ----------------
    data["PGT-M treatment"] = features.get("pgt_m", np.nan)
    data["PGT-A treatment"] = features.get("pgt_a", np.nan)
    data["Elective single embryo transfer"] = features.get("single_embryo_transfer", np.nan)
    data["Fresh cycle"] = features.get("fresh_cycle", np.nan)
    data["Frozen cycle"] = features.get("frozen_cycle", np.nan)

    # ---------------- INFERTILITY CAUSES ----------------
    data["Causes of infertility - endometriosis"] = features.get("endometriosis", np.nan)
    data["Causes of infertility - male factor"] = 1 if features.get("sperm_source") == "Partner" else 0
    data["Causes of infertility - tubal disease"] = 0
    data["Causes of infertility - ovulatory disorder"] = 0
    data["Causes of infertility - patient unexplained"] = 1

    # ---------------- OTHER ----------------
    data["Stimulation used"] = 1
    data["Embryos transferred from eggs micro-injected"] = np.nan

    # ---------------- MISSING FLAGS ----------------
    data["Specific treatment type__missing"] = 0
    data["Patient ethnicity__missing"] = 1
    data["Sperm source__missing"] = 0
    data["Egg source__missing"] = 0

    return pd.DataFrame([data])


def build_model_b_input(features):
    data = {
        "age": features.get("age", np.nan),
        "amh": features.get("amh", np.nan),
        "fsh": features.get("fsh", np.nan),
        "bmi": features.get("bmi", np.nan),
        "endometrial_thickness": features.get("endometrial_thickness", np.nan),
        "cycle_number": features.get("cycle_number", np.nan),
        "embryo_grade": np.nan if features.get("embryo_grade") is None else features["embryo_grade"],
    }

    return pd.DataFrame([data])


def align_with_model(df: pd.DataFrame, model) -> pd.DataFrame:
    required_cols = model.feature_names_in_

    for col in required_cols:
        if col not in df.columns:
            df[col] = np.nan   # default safe value

    # Keep only required columns (order matters)
    df = df[required_cols]

    return df


def fuse(prob_a, prob_b):
    conf_a = abs(prob_a - 0.5)
    conf_b = abs(prob_b - 0.5)

    if conf_a > conf_b:
        return 0.6 * prob_a + 0.4 * prob_b
    else:
        return 0.4 * prob_a + 0.6 * prob_b


@dataclass
class Factor:
    message: str
    severity: str
    feature: str
    direction: str
    value: Optional[float] = None


@dataclass
class ExplanationResult:
    positive_factors: list[Factor] = field(default_factory=list)
    negative_factors: list[Factor] = field(default_factory=list)
    neutral_factors: list[Factor] = field(default_factory=list)
    missing_features: list[str] = field(default_factory=list)
    confidence_note: str = ""


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if f < 0 else f
    except (TypeError, ValueError):
        return None


def _pct(val: float) -> str:
    return f"{val:.1f}".rstrip("0").rstrip(".")


def _eval_age(age: float) -> Factor:
    if age >= 42:
        return Factor(
            f"Very advanced maternal age ({age:.0f} yrs) — significantly reduces response and implantation rates",
            "high", "age", "negative", age
        )
    if age >= 38:
        return Factor(
            f"Advanced maternal age ({age:.0f} yrs) — moderate reduction in egg quality and reserve",
            "moderate", "age", "negative", age
        )
    if age > 35:
        return Factor(
            f"Age slightly above optimal ({age:.0f} yrs) — mild negative impact on egg quality",
            "low", "age", "negative", age
        )
    if age < 25:
        return Factor(
            f"Very young maternal age ({age:.0f} yrs) — excellent egg quality expected",
            "low", "age", "positive", age
        )
    if age <= 30:
        return Factor(
            f"Young maternal age ({age:.0f} yrs) — strong ovarian response expected",
            "moderate", "age", "positive", age
        )
    return Factor(f"Optimal reproductive age ({age:.0f} yrs)", "low", "age", "positive", age)


def _eval_amh(amh: float) -> Factor:
    if amh < 0.5:
        return Factor(
            f"Critically low ovarian reserve (AMH = {_pct(amh)} ng/mL) — likely reduced ovarian response",
            "high", "amh", "negative", amh
        )
    if amh < 1.0:
        return Factor(
            f"Low ovarian reserve (AMH = {_pct(amh)} ng/mL) — reduced egg yield expected",
            "moderate", "amh", "negative", amh
        )
    if amh < 1.5:
        return Factor(
            f"Borderline AMH ({_pct(amh)} ng/mL) — cautious stimulation approach needed",
            "low", "amh", "negative", amh
        )
    if amh <= 3.5:
        return Factor(f"Normal ovarian reserve (AMH = {_pct(amh)} ng/mL)", "low", "amh", "positive", amh)
    if amh <= 6.0:
        return Factor(
            f"Good ovarian reserve (AMH = {_pct(amh)} ng/mL) — strong response expected",
            "moderate", "amh", "positive", amh
        )
    return Factor(f"Very high AMH ({_pct(amh)} ng/mL) — monitor for OHSS risk", "low", "amh", "neutral", amh)


def _eval_fsh(fsh: float) -> Factor:
    if fsh > 20:
        return Factor(
            f"Severely elevated FSH ({_pct(fsh)} IU/L) — strongly suggests diminished ovarian reserve",
            "high", "fsh", "negative", fsh
        )
    if fsh > 15:
        return Factor(f"High FSH ({_pct(fsh)} IU/L) — reduced ovarian response likely", "moderate", "fsh", "negative", fsh)
    if fsh > 10:
        return Factor(f"Mildly elevated FSH ({_pct(fsh)} IU/L) — borderline ovarian response", "low", "fsh", "negative", fsh)
    if fsh >= 3:
        return Factor(f"Normal FSH ({_pct(fsh)} IU/L) — good ovarian axis function", "low", "fsh", "positive", fsh)
    return Factor(f"Unusually low FSH ({_pct(fsh)} IU/L) — verify pituitary function", "low", "fsh", "neutral", fsh)


def _eval_bmi(bmi: float) -> Factor:
    if bmi < 16:
        return Factor(f"Severely underweight (BMI {_pct(bmi)}) — risk of anovulation and poor response", "high", "bmi", "negative", bmi)
    if bmi < 18.5:
        return Factor(f"Underweight (BMI {_pct(bmi)}) — may affect hormonal environment", "moderate", "bmi", "negative", bmi)
    if bmi <= 24.9:
        return Factor(f"Healthy BMI ({_pct(bmi)}) — optimal hormonal profile", "low", "bmi", "positive", bmi)
    if bmi <= 29.9:
        return Factor(f"Overweight (BMI {_pct(bmi)}) — mild impact on embryo implantation", "low", "bmi", "negative", bmi)
    if bmi <= 35:
        return Factor(f"Obese (BMI {_pct(bmi)}) — elevated risk of poor response and miscarriage", "moderate", "bmi", "negative", bmi)
    return Factor(f"Severely obese (BMI {_pct(bmi)}) — significantly impairs hormonal balance and IVF outcomes", "high", "bmi", "negative", bmi)


def _eval_endometrium(thickness: float) -> Factor:
    if thickness < 6:
        return Factor(
            f"Very thin endometrial lining ({_pct(thickness)} mm) — reduced likelihood of implantation without intervention",
            "high", "endometrial_thickness", "negative", thickness
        )
    if thickness < 7:
        return Factor(f"Thin endometrial lining ({_pct(thickness)} mm) — implantation compromised", "moderate", "endometrial_thickness", "negative", thickness)
    if thickness < 8:
        return Factor(f"Borderline endometrial thickness ({_pct(thickness)} mm) — acceptable but sub-optimal", "low", "endometrial_thickness", "negative", thickness)
    if thickness <= 12:
        return Factor(f"Optimal endometrial thickness ({_pct(thickness)} mm) — favourable for implantation", "moderate", "endometrial_thickness", "positive", thickness)
    if thickness <= 14:
        return Factor(f"Slightly thick endometrium ({_pct(thickness)} mm) — generally acceptable", "low", "endometrial_thickness", "positive", thickness)
    return Factor(f"Excessively thick endometrium ({_pct(thickness)} mm) — may indicate pathology; review needed", "moderate", "endometrial_thickness", "neutral", thickness)


def _eval_embryo_grade(grade: float) -> Factor:
    if grade <= 1:
        return Factor("Poor embryo quality (Grade 1) — very low implantation potential", "high", "embryo_grade", "negative", grade)
    if grade == 2:
        return Factor("Below-average embryo quality (Grade 2) — reduced implantation potential", "moderate", "embryo_grade", "negative", grade)
    if grade == 3:
        return Factor("Average embryo quality (Grade 3) — moderate implantation potential", "low", "embryo_grade", "neutral", grade)
    if grade == 4:
        return Factor("Good embryo quality (Grade 4) — favourable implantation potential", "moderate", "embryo_grade", "positive", grade)
    return Factor("Excellent embryo quality (Grade 5/top) — optimal implantation potential", "high", "embryo_grade", "positive", grade)


def _eval_embryos_created(count: float) -> Factor:
    n = int(count)
    if n == 0:
        return Factor("No viable embryos created — cycle failed at fertilisation stage", "high", "embryos_created", "negative", count)
    if n == 1:
        return Factor("Only 1 embryo created — minimal backup; high-pressure transfer", "high", "embryos_created", "negative", count)
    if n <= 2:
        return Factor(f"Low embryo yield ({n}) — limited options if primary transfer fails", "moderate", "embryos_created", "negative", count)
    if n <= 4:
        return Factor(f"Moderate embryo yield ({n}) — sufficient for transfer with limited backup", "low", "embryos_created", "neutral", count)
    if n <= 7:
        return Factor(f"Good embryo yield ({n}) — adequate transfer options and cryopreservation potential", "moderate", "embryos_created", "positive", count)
    return Factor(f"Excellent embryo yield ({n}) — strong backup reserve for future cycles", "high", "embryos_created", "positive", count)


def _eval_fertilisation_rate(rate: float) -> Factor:
    r = rate if rate <= 1.0 else rate / 100.0
    pct = r * 100
    if r < 0.30:
        return Factor(f"Very low fertilisation rate ({pct:.0f}%) — possible sperm-egg interaction issue", "high", "fertilisation_rate", "negative", r)
    if r < 0.50:
        return Factor(f"Low fertilisation rate ({pct:.0f}%) — below expected clinical range", "moderate", "fertilisation_rate", "negative", r)
    if r < 0.65:
        return Factor(f"Acceptable fertilisation rate ({pct:.0f}%)", "low", "fertilisation_rate", "neutral", r)
    if r <= 0.80:
        return Factor(f"Good fertilisation rate ({pct:.0f}%)", "moderate", "fertilisation_rate", "positive", r)
    return Factor(f"Excellent fertilisation rate ({pct:.0f}%)", "high", "fertilisation_rate", "positive", r)


def _eval_oocytes(count: float) -> Factor:
    n = int(count)
    if n == 0:
        return Factor("No oocytes retrieved — cycle failed at retrieval", "high", "oocytes_retrieved", "negative", count)
    if n <= 2:
        return Factor(f"Very low oocyte yield ({n}) — poor ovarian response", "high", "oocytes_retrieved", "negative", count)
    if n <= 4:
        return Factor(f"Low oocyte yield ({n}) — below optimal", "moderate", "oocytes_retrieved", "negative", count)
    if n <= 8:
        return Factor(f"Normal oocyte yield ({n})", "low", "oocytes_retrieved", "positive", count)
    if n <= 15:
        return Factor(f"Good oocyte yield ({n}) — strong response", "moderate", "oocytes_retrieved", "positive", count)
    return Factor(f"Very high oocyte yield ({n}) — monitor for OHSS", "low", "oocytes_retrieved", "neutral", count)


def _eval_prior_failures(failures: float) -> Factor:
    n = int(failures)
    if n == 0:
        return Factor("No prior failed IVF cycles — first attempt advantage", "low", "prior_failures", "positive", failures)
    if n == 1:
        return Factor("1 prior failed cycle — slightly reduced success probability", "low", "prior_failures", "negative", failures)
    if n == 2:
        return Factor("2 prior failed cycles — recurrent failure pattern emerging", "moderate", "prior_failures", "negative", failures)
    if n == 3:
        return Factor("3 prior failed cycles — recurrent implantation failure; consider ERA/PGT", "high", "prior_failures", "negative", failures)
    return Factor(f"{n} prior failed cycles — high recurrence; comprehensive review recommended", "high", "prior_failures", "negative", failures)


def _eval_sperm_motility(motility: float) -> Factor:
    r = motility if motility <= 1.0 else motility / 100.0
    pct = r * 100
    if r < 0.10:
        return Factor(f"Critically low sperm motility ({pct:.0f}%) — ICSI strongly recommended", "high", "sperm_motility", "negative", r)
    if r < 0.32:
        return Factor(f"Low sperm motility ({pct:.0f}%) — below WHO reference (32%)", "moderate", "sperm_motility", "negative", r)
    if r < 0.40:
        return Factor(f"Borderline sperm motility ({pct:.0f}%)", "low", "sperm_motility", "negative", r)
    return Factor(f"Normal sperm motility ({pct:.0f}%)", "low", "sperm_motility", "positive", r)


def _eval_afc(afc: float) -> Factor:
    n = int(afc)
    if n <= 3:
        return Factor(f"Very low antral follicle count (AFC = {n}) — severely diminished reserve", "high", "afc", "negative", afc)
    if n <= 6:
        return Factor(f"Low AFC ({n}) — poor ovarian reserve; expect low oocyte yield", "moderate", "afc", "negative", afc)
    if n <= 10:
        return Factor(f"Normal AFC ({n}) — adequate ovarian reserve", "low", "afc", "positive", afc)
    if n <= 20:
        return Factor(f"Good AFC ({n}) — strong ovarian reserve", "moderate", "afc", "positive", afc)
    return Factor(f"High AFC ({n}) — excellent reserve; OHSS risk should be monitored", "low", "afc", "neutral", afc)


EVALUATORS = {
    "age": _eval_age,
    "amh": _eval_amh,
    "fsh": _eval_fsh,
    "bmi": _eval_bmi,
    "endometrial_thickness": _eval_endometrium,
    "embryo_grade": _eval_embryo_grade,
    "embryos_created": _eval_embryos_created,
    "fertilisation_rate": _eval_fertilisation_rate,
    "oocytes_retrieved": _eval_oocytes,
    "prior_failures": _eval_prior_failures,
    "sperm_motility": _eval_sperm_motility,
    "afc": _eval_afc,
}

IMPORTANT_FEATURES = {"age", "amh", "embryo_grade", "endometrial_thickness"}


def generate_explanation(features: dict, prob: float) -> ExplanationResult:
    result = ExplanationResult()
    _sev = {"high": 0, "moderate": 1, "low": 2}
    TOP_N = 3

    for key, evaluator in EVALUATORS.items():
        val = _safe_float(features.get(key))
        if val is None:
            if key in IMPORTANT_FEATURES:
                result.missing_features.append(key)
            continue

        factor = evaluator(val)
        if factor.direction == "positive":
            result.positive_factors.append(factor)
        elif factor.direction == "negative":
            result.negative_factors.append(factor)
        else:
            result.neutral_factors.append(factor)

    result.positive_factors.sort(key=lambda f: _sev.get(f.severity, 9))
    result.negative_factors.sort(key=lambda f: _sev.get(f.severity, 9))
    result.neutral_factors.sort(key=lambda f: _sev.get(f.severity, 9))
    result.positive_factors = result.positive_factors[:TOP_N]
    result.negative_factors = result.negative_factors[:TOP_N]

    provided = sum(1 for k in EVALUATORS if _safe_float(features.get(k)) is not None)
    total_possible = len(EVALUATORS)
    if provided < 4:
        result.confidence_note = "Very few features provided; prediction reliability is limited."
    elif provided < 7:
        result.confidence_note = (
            "Partial feature set; confidence is moderate. Providing more clinical data will improve accuracy."
        )
    else:
        result.confidence_note = f"{provided}/{total_possible} clinical features evaluated."

    return result


def generate_summary(explanation: ExplanationResult, prob: float) -> str:
    high_neg = sum(1 for f in explanation.negative_factors if f.severity == "high")
    high_pos = sum(1 for f in explanation.positive_factors if f.severity == "high")

    if prob >= 0.70:
        base = "High likelihood of IVF success"
    elif prob >= 0.55:
        base = "Moderately high likelihood of IVF success"
    elif prob >= 0.45:
        base = "Moderate likelihood of IVF success"
    elif prob >= 0.30:
        base = "Below-average likelihood of IVF success"
    else:
        base = "Low likelihood of IVF success"

    if high_neg >= 2:
        base += " - multiple high-severity risk factors present"
    elif high_neg == 1:
        base += " - one critical risk factor identified"
    if high_pos >= 2:
        base += "; strong clinical indicators supporting success"
    elif high_pos == 1:
        base += "; at least one strong favourable indicator"

    if explanation.missing_features:
        missing_str = ", ".join(explanation.missing_features)
        base += f". Note: key data missing ({missing_str})"

    return base


def get_key_drivers(explanation: ExplanationResult):
    return {
        "positive": explanation.positive_factors[:2],
        "negative": explanation.negative_factors[:2],
    }


def split_drivers_and_lists(explanation: ExplanationResult):
    pos = explanation.positive_factors
    neg = explanation.negative_factors
    drivers_pos = pos[:2]
    drivers_neg = neg[:2]
    remaining_pos = pos[2:]
    remaining_neg = neg[2:]
    return drivers_pos, drivers_neg, remaining_pos, remaining_neg


def short_why(drivers_pos, drivers_neg):
    def clean_sentence(s):
        return s[0].lower() + s[1:] if s else s

    parts = []
    if drivers_pos:
        parts.append("Driven by " + ", ".join([clean_sentence(d.message) for d in drivers_pos[:1]]))
    if drivers_neg:
        parts.append("offset by " + ", ".join([clean_sentence(d.message) for d in drivers_neg[:1]]))
    if not parts:
        return "Driven by limited available clinical signals."
    return "; ".join(parts)


def _to_rule_based_payload(explanation: ExplanationResult, prob: float) -> dict:
    drivers_pos, drivers_neg, _, _ = split_drivers_and_lists(explanation)
    detailed_negatives = []
    for f in explanation.negative_factors:
        detailed_negatives.append(
            {
                "factor": f.message,
                "severity": f.severity,
                "why_it_matters": "This clinical factor is associated with reduced IVF success likelihood.",
                "impact": f"Severity is estimated as {f.severity}, which may negatively affect treatment outcome.",
                "how_to_improve": {
                    "short_term": [
                        "Start immediate daily actions matched to this risk factor.",
                        "Track one measurable marker weekly to monitor early response.",
                    ],
                    "before_next_cycle": [
                        "Build a pre-cycle optimization plan based on repeat values of this factor.",
                    ],
                    "clinical_options": [
                        "Use non-prescription clinical planning and monitoring options tailored to this risk.",
                    ],
                },
            }
        )

    return {
        "summary": generate_summary(explanation, prob),
        "key_drivers": [f.message for f in drivers_pos + drivers_neg],
        "positive_factors": [
            {
                "factor": f.message,
                "why_it_matters": "This factor is associated with better ovarian response, embryo potential, or implantation conditions.",
            }
            for f in explanation.positive_factors
        ],
        "negative_factors": detailed_negatives,
        "final_guidance": "",
    }


def compute_confidence(prob_a, prob_b, features):
    import numpy as np

    # ----------------------------
    # 1. Combined probability
    # ----------------------------
    prob = (prob_a + prob_b) / 2
    certainty = abs(prob - 0.5)

    # ----------------------------
    # 2. Model agreement
    # ----------------------------
    agreement = 1 - abs(prob_a - prob_b)

    # ----------------------------
    # 3. Missing data ratio
    # ----------------------------
    missing_fields = features.get("missing_fields")

    if missing_fields is None:
        missing_fields = [
            k for k, v in features.items()
            if v is None or (isinstance(v, float) and np.isnan(v))
        ]

    missing_ratio = len(missing_fields) / max(len(features), 1)
    completeness = 1 - missing_ratio

    # ----------------------------
    # 4. BALANCED WEIGHTS
    # ----------------------------
    confidence_score = (
        0.5 * certainty +
        0.25 * agreement +
        0.25 * completeness
    )

    # ----------------------------
    # 5. HARD RULES (important)
    # ----------------------------

    # Too close to 0.5 -> cap at Medium (not always Low)
    if certainty < 0.08:
        return ("Medium" if confidence_score > 0.48 else "Low"), round(confidence_score, 3)

    # Too much missing -> low confidence
    if missing_ratio > 0.4:
        return "Low", round(confidence_score, 3)

    # ----------------------------
    # 6. FINAL LABELS
    # ----------------------------
    if confidence_score > 0.53:
        label = "High"
    elif confidence_score > 0.42:
        label = "Medium"
    else:
        label = "Low"

    return label, round(confidence_score, 3)


# ----------------------------
# PREDICTION FUNCTION
# ----------------------------
def predict(source):
    """
    source can be:
    - text (str)
    - pdf path (str)
    - structured features (dict)
    """

    # ----------------------------
    # HANDLE INPUT TYPES
    # ----------------------------
    if isinstance(source, dict):
        # Already structured -> skip NLP
        features = source
    else:
        # Text or PDF -> run extractor
        result = process_input(source)
        features = result["features"]

    # Model A input (IVF schema)
    df_a = build_full_model_input(features)
    df_a = align_with_model(df_a, model_a)

    # Model B input (numeric schema)
    df_b = build_model_b_input(features)
    df_b = align_with_model(df_b, model_b)

    # ----------------------------
    # DEBUG (uncomment if needed)
    # ----------------------------
    # print("\nModel A expects:", model_a.feature_names_in_)
    # print("Model B expects:", model_b.feature_names_in_)
    # print("Input A columns:", df_a.columns)
    # print("Input B columns:", df_b.columns)

    try:
        # 3. Individual predictions
        prob_a = model_a.predict_proba(df_a)[0][1]
        prob_b = model_b.predict_proba(df_b)[0][1]

        # 4. Stage-aware fusion
        stage = features.get("stage", "unknown")

        if stage == "stimulation":
            final_prob = prob_a
        else:
            final_prob = fuse(prob_a, prob_b)

        label = "Success" if final_prob >= 0.5 else "Failure"

    except Exception as e:
        raise RuntimeError(f"❌ Prediction failed: {e}")

    # 5. Output
    missing_fields = features.get("missing_fields")

    if missing_fields is None:
        # compute manually for structured input
        missing_fields = [k for k, v in features.items() if v is None or (isinstance(v, float) and np.isnan(v))]

    missing_ratio = len(missing_fields) / max(len(features), 1)

    if missing_ratio is not None and not pd.isna(missing_ratio) and missing_ratio < 0.1:
        data_quality = "High"
    elif missing_ratio is not None and not pd.isna(missing_ratio) and missing_ratio < 0.3:
        data_quality = "Medium"
    else:
        data_quality = "Low"

    confidence_label, confidence_score = compute_confidence(prob_a, prob_b, features)

    rule_based_explanation = generate_explanation(features, final_prob)
    rule_based_payload = _to_rule_based_payload(rule_based_explanation, final_prob)

    llm_input = {
        "prediction": label,
        "probability": float(final_prob),
        "confidence": confidence_label,
        "features": features,
        "positive_factors": rule_based_payload["positive_factors"],
        "negative_factors": rule_based_payload["negative_factors"],
        "key_drivers": rule_based_payload["key_drivers"],
        "missing_fields": features.get("missing_fields", []),
    }

    llm_output = generate_llm_explanation(llm_input)
    explanation = llm_output if isinstance(llm_output, dict) else rule_based_payload

    # ----------------------------
    # KNOWLEDGE GRAPH INTEGRATION
    # ----------------------------
    patient_id = "P001"   # later you can make dynamic
    graph.create_patient_subgraph(
        patient_id=patient_id,
        features=features,
        explanation_result=rule_based_explanation,
        predicted_prob=final_prob
    )
    risk_paths = graph.get_risk_paths(patient_id)
    critical_path = graph.get_critical_path()
    graph.save(f"data/graph_{patient_id}.json")

    return {
        "final_probability": float(final_prob),
        "model_a_probability": float(prob_a),
        "model_b_probability": float(prob_b),
        "label": label,
        "confidence": confidence_label,
        "confidence_score": confidence_score,
        "data_quality_confidence": data_quality,
        "summary": explanation.get("summary", rule_based_payload["summary"]),
        "explanation": explanation,
        "risk_paths": risk_paths,
        "critical_path": critical_path,
        "features": features
    }


# ----------------------------
# TEST
# -------------------------


    # ----------------------------
    # 🧪 TEST CASES
    # ----------------------------

    # 1. Ideal case (high success)
 

if __name__ == "__main__":

    def test_confidence_case(name, features):
        print(f"\n===== CONFIDENCE TEST: {name} =====")

        output = predict(features)
        missing_fields = output["features"].get("missing_fields")
        if missing_fields is None:
            missing_fields = [
                k for k, v in output["features"].items()
                if v is None or (isinstance(v, float) and np.isnan(v))
            ]
        missing_ratio = len(missing_fields) / max(len(output["features"]), 1)

        print("Prediction:", output["label"])
        print("Probability:", round(output["final_probability"], 4))
        print("Model A:", round(output["model_a_probability"], 4))
        print("Model B:", round(output["model_b_probability"], 4))
        print(f"\nConfidence: {output['confidence']} ({output['confidence_score']})")
        print(
            "Reason:",
            "High agreement and sufficient data" if output["confidence"] == "High"
            else "Moderate agreement or limited data" if output["confidence"] == "Medium"
            else "Low certainty due to missing data or model disagreement"
        )
        print("\n=== EXPLANATION ===")
        print("\nSummary:")
        print(output.get("summary", output["explanation"].get("summary", "")))
        explanation = output.get("explanation", {})
        key_drivers = explanation.get("key_drivers", [])
        positive_factors = explanation.get("positive_factors", [])
        negative_factors = explanation.get("negative_factors", [])
        print("Why:")
        if key_drivers:
            print("Driven by " + "; ".join(key_drivers[:2]))
        else:
            print("Driven by limited available clinical signals.")
        print("\nKey Drivers:")
        if not key_drivers:
            print("• No dominant drivers identified due to limited data")
        else:
            for driver in key_drivers:
                print("•", driver)

        print("\nAdditional Positive Factors:")
        if positive_factors:
            for p in positive_factors:
                print("✔", p)
        else:
            if missing_ratio > 0.6:
                print("• Insufficient clinical data to identify risk or protective factors")
            else:
                print("• No strong positive factors identified")
        print("\nAdditional Risk Factors:")
        if negative_factors:
            for n in negative_factors:
                print("✖", n)
        else:
            if missing_ratio > 0.6:
                print("• Insufficient clinical data to identify risk or protective factors")
            else:
                print("• No major risk factors identified")

        print("\n=== KNOWLEDGE GRAPH REASONING ===")
        if output.get("critical_path"):
            print("\nMost Influential Path:")
            print("•", " → ".join(output["critical_path"]))

        if output.get("risk_paths"):
            print("\nKey Risk Pathways:")
            for path in output["risk_paths"][:3]:
                print("•", " → ".join(path))
        else:
            print("• No strong causal risk pathways identified")

        print("\n--- Features ---")
        for k, v in output["features"].items():
            print(k, ":", v)


    # ============================
    # 🧪 CONFIDENCE TEST CASES
    # ============================

    # 🟢 1. Strong success → HIGH confidence
    test_confidence_case("High Confidence Success", {
        "age": 27,
        "amh": 4.5,
        "fsh": 5,
        "bmi": 21,
        "endometrial_thickness": 10,
        "cycle_number": 1,
        "embryo_grade": 3,
        "total_eggs": 18,
        "embryos_created": 12,
        "embryos_transferred": 2,
    })

    # 🔴 2. Strong failure → HIGH confidence
    test_confidence_case("High Confidence Failure", {
        "age": 40,
        "amh": 0.4,
        "fsh": 15,
        "bmi": 28,
        "endometrial_thickness": 5,
        "cycle_number": 3,
        "embryo_grade": 1,
        "total_eggs": 2,
        "embryos_created": 1,
        "embryos_transferred": 1,
    })

    # 🟡 3. Model disagreement → MEDIUM confidence
    test_confidence_case("Model Disagreement", {
        "age": 32,
        "amh": 2.0,
        "fsh": 8,
        "bmi": 24,
        "endometrial_thickness": 8,
        "cycle_number": 2,
        "embryo_grade": 2,
    })

    # ⚠️ 4. Missing data → LOW confidence
    test_confidence_case("Missing Data", {
        "age": 35,
        "amh": 0.6,
        "fsh": None,
        "bmi": None,
    })

    # ❌ 5. All missing → VERY LOW confidence
    test_confidence_case("All Missing", {
        "age": None,
        "amh": None,
        "fsh": None,
    })

    # 🔥 6. Noisy realistic case → LOW/MEDIUM confidence
    test_confidence_case("Noisy Real-world Case", {
        "age": 30,
        "amh": 3.0,
        "bmi": 27,
        # missing key fields intentionally
    })