def split_features(features):
    """
    Split extracted features into model A and model B inputs
    """

    # ---------------- MODEL A ----------------
    model_a_features = {
        "age": features.get("age", 0),
        "amh": features.get("amh", 0),
        "fsh": features.get("fsh", 0),
        "bmi": features.get("bmi", 0),
        "endometrial_thickness": features.get("endometrial_thickness", 0),
        "cycle_number": features.get("cycle_number", 0),
        "embryo_grade": features["embryo_grade"] if features.get("embryo_grade") is not None else 0,
        "pcos": features.get("pcos", 0),
        "endometriosis": features.get("endometriosis", 0),
        "smoking": features.get("smoking", 0),
    }

    # ---------------- MODEL B ----------------
    model_b_features = {
        "patient_age_group": features.get("patient_age_group"),
        "treatment": features.get("treatment"),
        "pgt_m": features.get("pgt_m", 0),
        "pgt_a": features.get("pgt_a", 0),
        "single_embryo_transfer": features.get("single_embryo_transfer", 0),
        "egg_source": features.get("egg_source"),
        "sperm_source": features.get("sperm_source"),
        "fresh_cycle": features.get("fresh_cycle", 0),
        "frozen_cycle": features.get("frozen_cycle", 0),
        "total_eggs": features["total_eggs"] if features.get("total_eggs") is not None else 0,
        "embryos_created": features["embryos_created"] if features.get("embryos_created") is not None else 0,
        "embryos_transferred": features["embryos_transferred"] if features.get("embryos_transferred") is not None else 0,
    }

    return model_a_features, model_b_features
