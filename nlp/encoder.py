import numpy as np


def encode_model_a(f):
    return np.array([
        f["age"],
        f["amh"] if f["amh"] != -1 else 0,
        f["fsh"] if f["fsh"] != -1 else 0,
        f["bmi"],
        f["endometrial_thickness"] if f["endometrial_thickness"] != -1 else 0,
        f["cycle_number"],
        f["embryo_grade"],
        f["pcos"],
        f["endometriosis"],
        f["smoking"]
    ]).reshape(1, -1)


def encode_model_b(f):
    # categorical encoding
    treatment = 1 if f["treatment"] == "ICSI" else 0
    age_group = {
        "18-34": 0,
        "35-39": 1,
        "40-42": 2
    }.get(f["patient_age_group"], 0)

    egg_source = 1 if f["egg_source"] == "Donor" else 0
    sperm_source = 1 if f["sperm_source"] == "Donor" else 0

    return np.array([
        age_group,
        treatment,
        f["pgt_m"],
        f["pgt_a"],
        f["single_embryo_transfer"],
        egg_source,
        sperm_source,
        f["fresh_cycle"],
        f["frozen_cycle"],
        f["total_eggs"],
        f["embryos_created"],
        f["embryos_transferred"]
    ]).reshape(1, -1)
