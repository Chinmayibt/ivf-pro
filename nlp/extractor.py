import re
import os
from typing import Dict, Any

# ----------------------------
# INPUT HANDLER (reuse yours)
# ----------------------------
try:
    from nlp.input_handler import get_input
except:
    from input_handler import get_input


# ----------------------------
# SPACY SETUP
# ----------------------------
import spacy
from spacy.matcher import Matcher

try:
    nlp = spacy.load("en_core_web_sm")
except:
    nlp = None

matcher = Matcher(nlp.vocab) if nlp else None


# ----------------------------
# MATCHER PATTERNS
# ----------------------------
if matcher:
    matcher.add("AMH", [[{"LOWER": "amh"}, {"IS_PUNCT": True, "OP": "?"}, {"LIKE_NUM": True}]])
    matcher.add("FSH", [[{"LOWER": "fsh"}, {"IS_PUNCT": True, "OP": "?"}, {"LIKE_NUM": True}]])
    matcher.add("BMI", [[{"LOWER": "bmi"}, {"IS_PUNCT": True, "OP": "?"}, {"LIKE_NUM": True}]])


# ----------------------------
# IVF COUNTS — REGEX PATTERNS
# ----------------------------
EGGS_PATTERNS = [
    r"(\d+)\s*(eggs|oocytes)\s*(retrieved|collected)",
    r"retrieved\s*(\d+)\s*(eggs|oocytes)",
    r"(\d+)\s*oocytes",
    # After normalize_for_counts, ":" / "=" become spaces ("eggs 15", "oocytes 12")
    r"(eggs|oocytes)\s+(\d+)\b",
    r"\bretrieved\s+(\d+)\b",
]

AGE_PATTERNS = [
    r"(\d{1,2})\s*(?:years?|yrs?)\s*(?:old)?",
    r"age\s*[:=]?\s*(\d{1,2})",
    r"(\d{1,2})\s*y/o",
]

AMH_PATTERNS = [
    r"amh\s*[:=]?\s*(\d+\.?\d*)",
    r"amh\s*(?:around|approx|~)?\s*(\d+\.?\d*)",
]

EMBRYO_CREATED_PATTERNS = [
    r"(\d+)\s*embryos?\s*(?:created|formed|developed)",
    r"embryos?\s*(?:created|formed)\s*[:=]?\s*(\d+)",
]

EMBRYO_TRANSFER_PATTERNS = [
    r"(\d+)\s*embryos?\s*(?:transferred)",
    r"(?:transferred|transfer)\s*[:=]?\s*(\d+)",
    r"(\d+)\s+transferred\b",
]

EMBRYO_QUALITY_MAP = {
    "poor": 1,
    "low quality": 1,
    "average": 2,
    "moderate": 2,
    "good": 3,
    "excellent": 3,
    "high quality": 3,
}


# ----------------------------
# NORMALIZATION
# ----------------------------
def normalize(text: str) -> str:
    text = text.lower()

    replacements = {
        "y/o": "year old y/o",
        "yrs": "years",
        "yr": "year",
        "f/": "female",
        "m/": "male",
        "wt": "weight",
        "hx": "history",
    }

    for k, v in replacements.items():
        text = re.sub(r"\b" + k + r"\b", v, text)

    # fix broken uppercase spacing from noisy OCR/PDF text (for example "i t" -> "it")
    text = re.sub(r"\b([a-z])\s+([a-z])\b", r"\1\2", text)

    # normalize odd casing artifacts from OCR output
    text = text.lower()

    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ----------------------------
# NUMERIC EXTRACTION
# ----------------------------
def extract_numbers(text: str) -> Dict[str, Any]:
    data = {
        "age": None,
        "amh": None,
        "fsh": None,
        "bmi": None,
        "endometrial_thickness": None,
        "cycle_number": None,
    }

    data["age"] = extract_age(text)

    # spaCy matcher for numeric fields
    if nlp:
        doc = nlp(text)
        matches = matcher(doc)

        for match_id, start, end in matches:
            span = doc[start:end].text
            val = re.findall(r"[\d.]+", span)
            if not val:
                continue
            val = float(val[0])

            label = nlp.vocab.strings[match_id]

            if label == "AMH":
                data["amh"] = val
            elif label == "FSH":
                data["fsh"] = val
            elif label == "BMI":
                data["bmi"] = val

    # fallback regex
    if data["amh"] is None:
        data["amh"] = extract_float_safe(AMH_PATTERNS, text)

    if data["fsh"] is None:
        m = re.search(r"fsh\s*[:=]?\s*([\d.]+)", text)
        if m:
            data["fsh"] = float(m.group(1))

    if data["bmi"] is None:
        m = re.search(r"bmi\s*[:=]?\s*([\d.]+)", text)
        if not m:
            m = re.search(r"([\d.]+)\s*kg/?m", text)
        if m:
            data["bmi"] = float(m.group(1))
        else:
            data["bmi"] = infer_bmi(text)

    # endometrium
    m = re.search(r"(endometrium|endometrial thickness)\s*[:=]?\s*([\d.]+)", text)
    if m:
        data["endometrial_thickness"] = float(m.group(2))

    # cycle number: explicit "cycle X of Y" pattern first
    m = re.search(r"cycle\s*(\d+)\s*of\s*\d+", text)
    if m:
        data["cycle_number"] = int(m.group(1))

    # cycle number (very flexible)
    cycle_patterns = [
        r"(\d+)(st|nd|rd|th)?\s*(cycle|ivf)",
        r"(cycle|ivf)\s*(\d+)"
    ]
    if data["cycle_number"] is None:
        for p in cycle_patterns:
            m = re.search(p, text)
            if m:
                nums = re.findall(r"\d+", m.group(0))
                if nums:
                    data["cycle_number"] = int(nums[0])
                    break

    # WORD -> NUMBER mapping
    if data["cycle_number"] is None:
        word_to_num = {
            "first": 1,
            "second": 2,
            "third": 3,
            "fourth": 4,
            "fifth": 5
        }

        # Detect word cycles
        for word, num in word_to_num.items():
            if f"{word} cycle" in text or f"{word} ivf" in text:
                data["cycle_number"] = num
                break

    return data


# ----------------------------
# HELPER
# ----------------------------
def has(text, keywords):
    return any(k in text for k in keywords)


def normalize_for_counts(text: str) -> str:
    """Lowercase and strip punctuation for flexible egg/embryo regex matching."""
    t = text.lower()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def extract_number(patterns, text):
    for p in patterns:
        match = re.search(p, text, re.IGNORECASE)
        if match:
            for g in match.groups():
                if g and str(g).isdigit():
                    return int(g)
    return None


def extract_age(text):
    for p in AGE_PATTERNS:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None


def extract_number_safe(patterns, text):
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            nums = [g for g in m.groups() if g and g.isdigit()]
            if nums:
                return int(nums[0])
    return None


def extract_float_safe(patterns, text):
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1))
            except:
                pass
    return None


def infer_bmi(text):
    t = text.lower()
    if "slightly high" in t or "overweight" in t:
        return 27
    if "obese" in t:
        return 32
    if "normal bmi" in t:
        return 22
    return None


def extract_embryo_quality(text: str):
    text_lower = text.lower()
    for word, val in sorted(EMBRYO_QUALITY_MAP.items(), key=lambda kv: len(kv[0]), reverse=True):
        if word in text_lower:
            return val
    return None


def extract_embryos_created(text):
    patterns = [
        r"embryos?\s*(?:created|formed|developed)\s*[:=]\s*(\d+)",
        r"(\d+)\s*embryos?\s*(?:created|formed|developed)",
    ]

    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None


def extract_eggs(text):
    patterns = [
        r"eggs?\s*[:=]?\s*(\d+)",
        r"(\d+)\s*(eggs|oocytes)\s*(retrieved|collected)",
        r"(?:retrieved|collected)\s*(\d+)\s*(eggs|oocytes)",
        r"eggs?\s*(?:around|approx|~)?\s*(\d+)",
    ]

    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            for g in m.groups():
                if g and g.isdigit():
                    return int(g)
    return None


def detect_stage(text):
    t = text.lower()
    if "retrieved" in t or "stimulation" in t:
        return "stimulation"
    if "transferred" in t or "transfer" in t:
        return "transfer"
    if "cycle" in t and "retrieved" not in t and "transfer" not in t:
        return "stimulation"
    return "unknown"


# ----------------------------
# VALIDATION
# ----------------------------
def validate(features: Dict[str, Any]):
    if features["age"] is not None and features["age"] > 50:
        print("WARNING: Unusual age detected")

    if features["amh"] is not None and features["amh"] > 10:
        print("WARNING: AMH seems unrealistic")


# ----------------------------
# MAIN FEATURE EXTRACTION
# ----------------------------
def extract_features(text: str) -> Dict[str, Any]:
    text = normalize(text)
    text_counts = normalize_for_counts(text)
    nums = extract_numbers(text)

    features = {}

    # ---------------- MODEL 1 ----------------
    features["age"] = nums["age"]
    features["amh"] = nums["amh"]
    features["fsh"] = nums["fsh"]
    features["bmi"] = nums["bmi"]
    features["endometrial_thickness"] = nums["endometrial_thickness"]
    features["cycle_number"] = nums["cycle_number"]

    features["pcos"] = 1 if has(text, ["pcos", "pcod"]) else 0
    features["endometriosis"] = 1 if "endometriosis" in text else 0
    if "non-smoker" in text or "non smoker" in text:
        features["smoking"] = 0
    elif "smoker" in text or "smoking" in text:
        features["smoking"] = 1
    else:
        features["smoking"] = 0

    # ---------------- MODEL 2 ----------------

    # age group
    if features["age"] is None:
        features["patient_age_group"] = "Unknown"
    elif features["age"] <= 34:
        features["patient_age_group"] = "18-34"
    elif features["age"] <= 39:
        features["patient_age_group"] = "35-39"
    else:
        features["patient_age_group"] = "40-42"

    # treatment
    if "ivf" in text:
        features["treatment"] = "IVF"
    elif "icsi" in text:
        features["treatment"] = "ICSI"
    else:
        features["treatment"] = "Unknown"

    features["pgt_m"] = 1 if "pgt-m" in text else 0
    features["pgt_a"] = 1 if "pgt-a" in text else 0

    features["single_embryo_transfer"] = 1 if "single embryo" in text else 0

    features["egg_source"] = "Donor" if "donor egg" in text else "Patient"
    features["sperm_source"] = "Donor" if "donor sperm" in text else "Partner"

    features["fresh_cycle"] = 1 if has(text, ["fresh cycle", "fresh ivf", "fresh transfer"]) else 0
    # Detect FUTURE plans first
    if "freeze-all strategy" in text or "planned" in text:
        features["frozen_cycle"] = 0

    # Actual frozen cycle
    elif "frozen cycle" in text or "fet" in text or "frozen embryo transfer" in text:
        features["frozen_cycle"] = 1
    else:
        features["frozen_cycle"] = 0

    # eggs / embryos (regex on punctuation-stripped text)
    features["total_eggs"] = extract_eggs(text)
    features["embryos_created"] = extract_embryos_created(text)
    features["embryos_transferred"] = extract_number_safe(EMBRYO_TRANSFER_PATTERNS, text_counts)
    features["embryo_grade"] = extract_embryo_quality(text_counts)
    if features["embryo_grade"] is None:
        ec = features.get("embryos_created")
        if ec is not None:
            if ec >= 8:
                features["embryo_grade"] = 3
            elif ec <= 2:
                features["embryo_grade"] = 1

    if "diminished ovarian reserve" in text or "dor" in text:
        features["AMH_low_flag"] = 1
    else:
        features["AMH_low_flag"] = 0

    features["stage"] = detect_stage(text)

    missing_keys = []

    for k, v in features.items():
        if v is None:
            missing_keys.append(k)

    features["missing_fields"] = missing_keys

    return features


# ----------------------------
# PIPELINE
# ----------------------------
def process_input(source: str):
    text = get_input(source)

    if not text:
        raise ValueError("Empty input")

    features = extract_features(text)
    validate(features)

    return {
        "text": text,
        "features": features
    }


# ----------------------------
# TEST
# ----------------------------
if __name__ == "__main__":

    pdf_path = "data/raw/ivf_dummy_report.pdf"   # 👈 put your PDF here

    print(f"\n📄 Testing PDF: {pdf_path}")

    try:
        result = process_input(pdf_path)

        print("\n--- RAW TEXT (first 500 chars) ---")
        print(result["text"][:500])
        print("----------------------------------")

        print("\n=== FEATURES ===")
        for k, v in result["features"].items():
            print(k, ":", v)

    except Exception as e:
        print("\n❌ ERROR:", str(e))