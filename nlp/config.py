# -----------------------------
# THRESHOLDS
# -----------------------------
THRESHOLDS = {
    "AMH_low": 1.0,
    "AMH_high": 3.5,
    "FSH_high": 10,
    "BMI_high": 25,
}

# -----------------------------
# SYNONYMS
# -----------------------------
SYNONYMS = {
    "PCOS": ["pcos", "pcod", "polycystic"],
    "ENDOMETRIOSIS": ["endometriosis"],
}

# -----------------------------
# CLINICAL PHRASES
# -----------------------------
PHRASES = {
    "AMH_low": [
        "diminished ovarian reserve",
        "poor ovarian response",
        "low reserve",
        "poor resp",
        "poor response",
        "dor",
    ],
    "FSH_high": [
        "elevated fsh",
        "high fsh",
        "fsh high",
        "fsh↑",
    ],
    "BMI_high": [
        "obese",
        "overweight",
        "high bmi",
        "wt↑",
        "weight high",
    ],
    "previous_failures": [
        "failed ivf",
        "ivf failure",
        "multiple failures",
        "unsuccessful",
    ],
    "embryo_quality_good": [
        "good embryo quality",
        "high quality embryos",
        "good blastocyst",
        "high quality blastocyst",
    ],
    "embryo_quality_poor": [
        "poor embryo quality",
        "poor embryo development",
        "low quality embryos",
        "poor grade",
        "embryos poor",
    ],
    "fertilization_rate_high": [
        "high fertilization rate",
        "good fertilization",
        "fert ok",
        "fert good",
    ],
    "fertilization_rate_low": [
        "low fertilization rate",
        "poor fertilization",
    ],
    "oocyte_count_high": [
        "high number of oocytes",
        "many oocytes retrieved",
    ],
    "oocyte_count_low": [
        "few oocytes",
        "low oocyte retrieval",
        "few eggs",
    ],
    "male_factor": [
        "male infertility",
        "low sperm count",
        "poor sperm motility",
        "male factor infertility",
        "low motility",
        "reduced sperm",
        "poor sperm",
    ],
}
