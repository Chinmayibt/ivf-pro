"""
Enrich knowledge-graph visualization nodes with prediction-aware fields
(rule-based factors, patient measurements, PageRank highlight).

Uses kg.ivf_graph mappings only — no import from predict_pipeline (avoids cycles).
"""

from __future__ import annotations

from typing import Any, Optional

from kg.ivf_graph import (
    FACTORS,
    FACTOR_KEY_MAP,
    FEATURE_TO_CONDITION,
    IVFGraph,
)

# Condition name → feature keys (multiple keys may map to the same condition)
CONDITION_TO_FEATURES: dict[str, list[str]] = {}
for _fk, _cond in FEATURE_TO_CONDITION.items():
    CONDITION_TO_FEATURES.setdefault(_cond, []).append(_fk)

_SEVERITY_CONF = {"high": 0.85, "moderate": 0.55, "low": 0.35}
_IMPACT_LABEL = {"high": "High", "moderate": "Medium", "low": "Low"}


def _factor_unit(factor_node_name: str) -> str:
    for row in FACTORS:
        if row["name"] == factor_node_name:
            return str(row.get("unit", "") or "")
    return ""


def _as_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        import math

        f = float(val)
        if math.isnan(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _direction_token(direction: str) -> str:
    d = (direction or "").lower()
    if d == "positive":
        return "improves"
    if d == "negative":
        return "reduces"
    return "neutral"


def _collect_factors_for_feature(
    feature_key: str,
    explanation_result: Any,
) -> list[Any]:
    out: list[Any] = []
    for bucket_name in ("negative_factors", "positive_factors", "neutral_factors"):
        bucket = getattr(explanation_result, bucket_name, None) or []
        for fac in bucket:
            if getattr(fac, "feature", None) == feature_key:
                out.append(fac)
    return out


def _pick_primary_factor(candidates: list[Any]) -> Optional[Any]:
    if not candidates:
        return None
    order = {"high": 0, "moderate": 1, "low": 2}
    neg = [f for f in candidates if getattr(f, "direction", "") == "negative"]
    pool = neg if neg else candidates
    return sorted(
        pool,
        key=lambda f: order.get(str(getattr(f, "severity", "low")).lower(), 9),
    )[0]


def _factors_for_condition(condition_name: str, explanation_result: Any) -> list[Any]:
    keys = CONDITION_TO_FEATURES.get(condition_name, [])
    found: list[Any] = []
    for fk in keys:
        found.extend(_collect_factors_for_feature(fk, explanation_result))
    # de-dupe by id
    seen: set[int] = set()
    uniq: list[Any] = []
    for f in found:
        fid = id(f)
        if fid not in seen:
            seen.add(fid)
            uniq.append(f)
    return uniq


def _explain_focus_node_ids(
    nodes_out: list[dict],
    explanation_result: Any,
) -> list[str]:
    """Node ids to emphasize for 'why this prediction' (top drivers + outcome)."""
    ids: set[str] = set()
    id_by_name: dict[str, str] = {}
    for n in nodes_out:
        name = n.get("name")
        nid = n.get("id")
        if name and nid:
            id_by_name[name] = nid

    for n in nodes_out:
        if n.get("label") == "Outcome" and n.get("name") == "IVF Success":
            ids.add(n["id"])

    def _pull_factors(bucket: str, limit: int) -> None:
        for fac in getattr(explanation_result, bucket, [])[:limit]:
            fk = getattr(fac, "feature", None)
            if not fk:
                continue
            cond = FEATURE_TO_CONDITION.get(fk)
            if cond and cond in id_by_name:
                ids.add(id_by_name[cond])
            for fname, fkey in FACTOR_KEY_MAP.items():
                if fkey == fk and fname in id_by_name:
                    ids.add(id_by_name[fname])

    _pull_factors("negative_factors", 3)
    _pull_factors("positive_factors", 3)

    return list(ids)


def _top_influential_factor_id(graph: IVFGraph, node_rows: list[dict]) -> Optional[str]:
    pr = graph.get_node_influence()
    factor_ids = [n["id"] for n in node_rows if n.get("label") == "Factor"]
    best_id: Optional[str] = None
    best = -1.0
    for fid in factor_ids:
        score = pr.get(fid)
        if score is not None and score > best:
            best = score
            best_id = fid
    return best_id


def enrich_visualization_graph(
    graph: IVFGraph,
    graph_data: dict[str, Any],
    features: dict[str, Any],
    explanation_result: Any,
    final_probability: float,
    confidence_score: float,
) -> dict[str, Any]:
    """
    Return { nodes, links, meta } with per-node insight fields merged in.
    """
    nodes_in = list(graph_data.get("nodes") or [])
    links = graph_data.get("links") or []

    top_id = _top_influential_factor_id(graph, nodes_in)

    nodes_out: list[dict] = []
    for raw in nodes_in:
        node = dict(raw)
        nid = node.get("id", "")
        lbl = node.get("label", "")
        name = node.get("name", nid)

        patient_value: Optional[float] = None
        patient_unit = ""
        matched_key: Optional[str] = None
        primary: Optional[Any] = None

        if lbl == "Factor" and name in FACTOR_KEY_MAP:
            matched_key = FACTOR_KEY_MAP[name]
            patient_value = _as_float(features.get(matched_key))
            patient_unit = _factor_unit(name)
            cands = _collect_factors_for_feature(matched_key, explanation_result)
            primary = _pick_primary_factor(cands)

        elif lbl == "Condition":
            cands = _factors_for_condition(name, explanation_result)
            primary = _pick_primary_factor(cands)
            if primary is not None:
                matched_key = getattr(primary, "feature", None)
            if matched_key:
                patient_value = _as_float(features.get(matched_key))
                for fname, fkey in FACTOR_KEY_MAP.items():
                    if fkey == matched_key:
                        patient_unit = _factor_unit(fname)
                        break

        if lbl == "Outcome" and name == "IVF Success":
            improves = final_probability >= 0.5
            node["direction"] = "improves" if improves else "reduces"
            node["impactLevel"] = (
                "High" if confidence_score >= 0.66 else "Medium" if confidence_score >= 0.33 else "Low"
            )
            node["confidence"] = round(float(confidence_score), 3)
            node["matchedFeatureKey"] = None
            node["patientValue"] = round(float(final_probability), 4)
            node["patientValueUnit"] = "predicted probability"
            node["isTopInfluential"] = False
            nodes_out.append(node)
            continue

        if lbl == "Patient" or nid.startswith("Patient:"):
            node.setdefault("direction", "neutral")
            node.setdefault("impactLevel", "Low")
            node.setdefault("confidence", round(float(confidence_score) * 0.5, 3))
            node["matchedFeatureKey"] = None
            node["isTopInfluential"] = False
            nodes_out.append(node)
            continue

        if lbl == "Intermediate":
            node.setdefault("direction", "neutral")
            node.setdefault("impactLevel", "Low")
            node.setdefault("confidence", 0.4)
            node["matchedFeatureKey"] = None
            node["isTopInfluential"] = False
            nodes_out.append(node)
            continue

        if primary is not None:
            sev = str(getattr(primary, "severity", "low")).lower()
            if sev not in _SEVERITY_CONF:
                sev = "low"
            node["direction"] = _direction_token(getattr(primary, "direction", "neutral"))
            node["impactLevel"] = _IMPACT_LABEL.get(sev, "Low")
            node["confidence"] = round(_SEVERITY_CONF[sev], 3)
        else:
            node.setdefault("direction", "neutral")
            node.setdefault("impactLevel", "Low")
            node.setdefault("confidence", 0.35)

        if matched_key:
            node["matchedFeatureKey"] = matched_key
        else:
            node["matchedFeatureKey"] = None

        if patient_value is not None:
            node["patientValue"] = round(patient_value, 4)
            node["patientValueUnit"] = patient_unit or ""
        else:
            node.setdefault("patientValue", None)
            node.setdefault("patientValueUnit", "")

        node["isTopInfluential"] = bool(top_id and nid == top_id)
        nodes_out.append(node)

    explain_ids = _explain_focus_node_ids(nodes_out, explanation_result)

    meta = {
        "topInfluentialNodeId": top_id,
        "predictionProbability": round(float(final_probability), 4),
        "modelConfidence": round(float(confidence_score), 4),
        "explainFocusNodeIds": explain_ids,
    }

    return {"nodes": nodes_out, "links": links, "meta": meta}
