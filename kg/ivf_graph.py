"""
IVF Knowledge Graph — NetworkX
Full feature-parity with Neo4j version, no DB required.

Features:
- Typed nodes (Factor / Condition / Intermediate / Outcome / Patient)
- Weighted directed edges with clinical_basis metadata
- Patient subgraph per prediction instance
- Integration with explanation_engine.ExplanationResult
- Export to dict for frontend (vis.js / D3 / Cytoscape)
- Serialisation: save/load graph as JSON
- Query helpers: risk paths, subgraph extraction, summary stats
"""

import json
import logging
from typing import Optional
from datetime import datetime
import networkx as nx

log = logging.getLogger("IVFGraph")
logging.basicConfig(level=logging.INFO)


# ─────────────────────────────────────────────
# SCHEMA DEFINITIONS
# ─────────────────────────────────────────────

FACTORS = [
    {"name": "AMH",                   "unit": "ng/mL", "category": "ovarian_reserve"},
    {"name": "Age",                   "unit": "years",  "category": "demographic"},
    {"name": "FSH",                   "unit": "IU/L",   "category": "hormonal"},
    {"name": "BMI",                   "unit": "kg/m2",  "category": "demographic"},
    {"name": "Endometrial Thickness", "unit": "mm",     "category": "uterine"},
    {"name": "Embryo Grade",          "unit": "grade",  "category": "embryology"},
    {"name": "Embryos Created",       "unit": "count",  "category": "embryology"},
    {"name": "Oocytes Retrieved",     "unit": "count",  "category": "ovarian_reserve"},
    {"name": "Fertilisation Rate",    "unit": "%",      "category": "embryology"},
    {"name": "AFC",                   "unit": "count",  "category": "ovarian_reserve"},
    {"name": "Sperm Motility",        "unit": "%",      "category": "male_factor"},
    {"name": "Prior IVF Failures",    "unit": "count",  "category": "history"},
]

CONDITIONS = [
    {"name": "Low Ovarian Reserve",     "severity": "high"},
    {"name": "High Age Risk",           "severity": "moderate"},
    {"name": "Hormonal Imbalance",      "severity": "moderate"},
    {"name": "High BMI Risk",           "severity": "moderate"},
    {"name": "Thin Endometrium",        "severity": "high"},
    {"name": "Poor Embryo Quality",     "severity": "high"},
    {"name": "Low Egg Yield",           "severity": "moderate"},
    {"name": "Low Fertilisation",       "severity": "moderate"},
    {"name": "Male Factor Infertility", "severity": "moderate"},
    {"name": "Recurrent Failure",       "severity": "high"},
    {"name": "OHSS Risk",               "severity": "moderate"},
]

INTERMEDIATES = [
    {"name": "Egg Production",       "pathway": "ovarian"},
    {"name": "Fertilisation",        "pathway": "embryology"},
    {"name": "Embryo Development",   "pathway": "embryology"},
    {"name": "Implantation",         "pathway": "uterine"},
    {"name": "Hormonal Environment", "pathway": "endocrine"},
]

# (from, relationship, to, weight, clinical_basis)
BASE_EDGES = [
    # AMH
    ("AMH",                   "AFFECTS",   "Low Ovarian Reserve",     0.90, "AMH<1 predicts DOR"),
    ("AMH",                   "AFFECTS",   "OHSS Risk",               0.60, "AMH>6 predicts OHSS"),
    ("Low Ovarian Reserve",   "LEADS_TO",  "Egg Production",          0.90, "DOR reduces oocyte yield"),

    # AFC
    ("AFC",                   "AFFECTS",   "Low Ovarian Reserve",     0.85, "AFC<7 confirms DOR"),
    ("AFC",                   "AFFECTS",   "OHSS Risk",               0.55, "High AFC → OHSS risk"),

    # Oocytes
    ("Oocytes Retrieved",     "AFFECTS",   "Egg Production",          0.95, "Direct oocyte yield measure"),
    ("Egg Production",        "FEEDS",     "Fertilisation",           0.90, "Oocytes needed for fertilisation"),

    # Age
    ("Age",                   "AFFECTS",   "High Age Risk",           0.85, "Age>35 reduces egg quality"),
    ("High Age Risk",         "LEADS_TO",  "Embryo Development",      0.80, "Aneuploidy risk increases with age"),
    ("Age",                   "AFFECTS",   "Hormonal Environment",    0.60, "Age alters FSH/LH ratio"),

    # FSH
    ("FSH",                   "AFFECTS",   "Hormonal Imbalance",      0.80, "FSH>10 indicates poor reserve"),
    ("Hormonal Imbalance",    "DISRUPTS",  "Hormonal Environment",    0.85, "FSH dysregulation impairs response"),
    ("Hormonal Environment",  "IMPACTS",   "Egg Production",          0.70, "Endocrine axis drives folliculogenesis"),

    # BMI
    ("BMI",                   "AFFECTS",   "High BMI Risk",           0.75, "BMI>30 impairs ovarian response"),
    ("High BMI Risk",         "DISRUPTS",  "Hormonal Environment",    0.70, "Adipose tissue alters oestrogen"),
    ("High BMI Risk",         "REDUCES",   "Implantation",            0.65, "Endometrial receptivity impaired"),

    # Endometrium
    ("Endometrial Thickness", "AFFECTS",   "Thin Endometrium",        0.90, "Thickness<7mm impairs receptivity"),
    ("Thin Endometrium",      "LEADS_TO",  "Implantation",            0.90, "Thin lining prevents embryo embedding"),

    # Embryo
    ("Embryo Grade",          "AFFECTS",   "Poor Embryo Quality",     0.90, "Grade directly predicts implantation"),
    ("Poor Embryo Quality",   "REDUCES",   "Embryo Development",      0.90, "Poor grade leads to embryo arrest"),
    ("Embryos Created",       "AFFECTS",   "Low Egg Yield",           0.80, "Low count limits selection options"),
    ("Low Egg Yield",         "REDUCES",   "Fertilisation",           0.75, "Fewer embryos to select from"),

    # Fertilisation rate
    ("Fertilisation Rate",    "AFFECTS",   "Low Fertilisation",       0.85, "Fert rate<50% is clinically abnormal"),
    ("Low Fertilisation",     "REDUCES",   "Embryo Development",      0.80, "Fewer embryos available for transfer"),

    # Sperm
    ("Sperm Motility",        "AFFECTS",   "Male Factor Infertility", 0.85, "Motility<32% — WHO threshold"),
    ("Male Factor Infertility","REDUCES",  "Fertilisation",           0.80, "Poor sperm-egg interaction"),

    # History
    ("Prior IVF Failures",    "AFFECTS",   "Recurrent Failure",       0.90, ">=3 failures defines RIF"),
    ("Recurrent Failure",     "REDUCES",   "Implantation",            0.85, "Implantation failure pattern established"),

    # Intermediates → Outcome
    ("Egg Production",        "IMPACTS",   "IVF Success",             0.90, "Oocyte yield drives entire cycle"),
    ("Fertilisation",         "IMPACTS",   "IVF Success",             0.95, "Fertilisation is the gating step"),
    ("Embryo Development",    "IMPACTS",   "IVF Success",             0.90, "Embryo quality drives implantation"),
    ("Implantation",          "IMPACTS",   "IVF Success",             0.95, "Implantation is the final step"),
    ("Hormonal Environment",  "IMPACTS",   "IVF Success",             0.70, "Endocrine support needed throughout"),
]

# Map explanation_engine feature keys → condition node names
FEATURE_TO_CONDITION = {
    "amh":                   "Low Ovarian Reserve",
    "age":                   "High Age Risk",
    "fsh":                   "Hormonal Imbalance",
    "bmi":                   "High BMI Risk",
    "endometrial_thickness": "Thin Endometrium",
    "embryo_grade":          "Poor Embryo Quality",
    "embryos_created":       "Low Egg Yield",
    "fertilisation_rate":    "Low Fertilisation",
    "sperm_motility":        "Male Factor Infertility",
    "prior_failures":        "Recurrent Failure",
    "oocytes_retrieved":     "Low Egg Yield",
    "afc":                   "Low Ovarian Reserve",
}

FACTOR_KEY_MAP = {
    "AMH":                   "amh",
    "Age":                   "age",
    "FSH":                   "fsh",
    "BMI":                   "bmi",
    "Endometrial Thickness": "endometrial_thickness",
    "Embryo Grade":          "embryo_grade",
    "Embryos Created":       "embryos_created",
    "Oocytes Retrieved":     "oocytes_retrieved",
    "Fertilisation Rate":    "fertilisation_rate",
    "AFC":                   "afc",
    "Sperm Motility":        "sperm_motility",
    "Prior IVF Failures":    "prior_failures",
}


# ─────────────────────────────────────────────
# GRAPH CLASS
# ─────────────────────────────────────────────

class IVFGraph:
    def __init__(self):
        self.G: nx.DiGraph = nx.DiGraph()
        self._build_base_graph()
        log.info("IVF Knowledge Graph initialised.")

    # ─────────────────────────────────────────
    # BUILD BASE GRAPH
    # ─────────────────────────────────────────

    def _build_base_graph(self):
        # Factor nodes
        for f in FACTORS:
            self.G.add_node(f["name"], label="Factor",
                            unit=f["unit"], category=f["category"])

        # Condition nodes
        for c in CONDITIONS:
            self.G.add_node(c["name"], label="Condition",
                            severity=c["severity"])

        # Intermediate nodes
        for i in INTERMEDIATES:
            self.G.add_node(i["name"], label="Intermediate",
                            pathway=i["pathway"])

        # Outcome node
        self.G.add_node("IVF Success", label="Outcome")

        # Edges with metadata
        for (src, rel, dst, weight, basis) in BASE_EDGES:
            self.G.add_edge(src, dst,
                            relationship=rel,
                            weight=weight,
                            clinical_basis=basis)

        log.info(
            f"Base graph: {self.G.number_of_nodes()} nodes, "
            f"{self.G.number_of_edges()} edges"
        )

    # ─────────────────────────────────────────
    # PATIENT SUBGRAPH
    # ─────────────────────────────────────────

    def create_patient_subgraph(
        self,
        patient_id: str,
        features: dict,
        explanation_result,      # ExplanationResult from explanation_engine
        predicted_prob: float
    ):
        """
        Adds a Patient node to the graph linked to:
        - All Factor nodes for which values were provided
        - All active Condition nodes from the explanation
        - The IVF Success outcome node
        """
        pid = f"Patient:{patient_id}"

        self.G.add_node(pid,
                        label="Patient",
                        patient_id=patient_id,
                        predicted_prob=round(predicted_prob, 4),
                        timestamp=datetime.now().isoformat())

        # Link patient → factors (with measured value)
        for fname, fkey in FACTOR_KEY_MAP.items():
            val = features.get(fkey)
            if val is not None:
                try:
                    self.G.add_edge(pid, fname,
                                    relationship="HAS_FACTOR",
                                    value=float(val),
                                    weight=1.0)
                except (TypeError, ValueError):
                    pass

        # Link patient → active risk conditions
        for factor in explanation_result.negative_factors:
            condition = FEATURE_TO_CONDITION.get(factor.feature)
            if condition and condition in self.G.nodes:
                self.G.add_edge(pid, condition,
                                relationship="HAS_RISK",
                                severity=factor.severity,
                                weight={"high": 1.0, "moderate": 0.6, "low": 0.3}
                                       .get(factor.severity, 0.5))

        # Link patient → outcome
        self.G.add_edge(pid, "IVF Success",
                        relationship="PREDICTED",
                        probability=round(predicted_prob, 4),
                        weight=predicted_prob)

        log.info(f"Patient subgraph created: {patient_id} (prob={predicted_prob:.2%})")

    # ─────────────────────────────────────────
    # QUERIES
    # ─────────────────────────────────────────

    def get_risk_paths(self, patient_id: str) -> list[list[str]]:
        """
        All simple paths from patient's risk conditions to IVF Success.
        Returns list of node-name paths.
        """
        pid = f"Patient:{patient_id}"
        paths = []

        # Get conditions this patient has
        risk_conditions = [
            dst for dst in self.G.successors(pid)
            if self.G.nodes[dst].get("label") == "Condition"
        ]

        for condition in risk_conditions:
            try:
                for path in nx.all_simple_paths(
                    self.G, source=condition,
                    target="IVF Success", cutoff=5
                ):
                    paths.append(path)
            except nx.NetworkXNoPath:
                pass

        return paths

    def get_patient_subgraph(self, patient_id: str) -> nx.DiGraph:
        """
        Extracts the ego subgraph around the patient node
        (all nodes reachable within 4 hops).
        """
        pid = f"Patient:{patient_id}"
        if pid not in self.G:
            raise ValueError(f"Patient '{patient_id}' not found in graph.")

        reachable = nx.single_source_shortest_path_length(
            self.G, pid, cutoff=4
        )
        return self.G.subgraph(list(reachable.keys())).copy()

    def get_critical_path(self) -> list[str]:
        """
        Most influential path from any Factor to IVF Success,
        ranked by cumulative edge weight.
        Uses max-weight path (converted to min-cost for Dijkstra).
        """
        factor_nodes = [n for n, d in self.G.nodes(data=True)
                        if d.get("label") == "Factor"]

        best_path, best_weight = [], 0.0

        for factor in factor_nodes:
            try:
                # Negate weights to find maximum-weight path
                inverted = {(u, v): 1 - d.get("weight", 0.5)
                            for u, v, d in self.G.edges(data=True)}
                nx.set_edge_attributes(self.G, inverted, "inv_weight")

                path = nx.dijkstra_path(
                    self.G, factor, "IVF Success", weight="inv_weight"
                )
                weight = sum(
                    self.G[path[i]][path[i+1]].get("weight", 0.5)
                    for i in range(len(path) - 1)
                )
                if weight > best_weight:
                    best_weight = weight
                    best_path = path
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue

        return best_path

    def get_node_influence(self) -> dict[str, float]:
        """
        PageRank-based influence score for each node.
        Higher = more central to predicting IVF Success.
        """
        pr = nx.pagerank(self.G, weight="weight")
        return dict(sorted(pr.items(), key=lambda x: x[1], reverse=True))

    def get_subgraph_for_visualization(self, patient_id: str) -> dict:
        nodes = set()
        edges = []

        # Get important paths
        risk_paths = self.get_risk_paths(patient_id)
        critical_path = self.get_critical_path()

        paths = risk_paths[:3]
        if critical_path:
            paths.append(critical_path)

        for path in paths:
            for i in range(len(path)):
                nodes.add(path[i])
                if i < len(path) - 1:
                    edges.append((path[i], path[i + 1]))

        return {
            "nodes": list(nodes),
            "edges": edges
        }

    def get_stats(self) -> dict:
        """Summary stats about the base graph."""
        factor_nodes    = [n for n, d in self.G.nodes(data=True) if d.get("label") == "Factor"]
        condition_nodes = [n for n, d in self.G.nodes(data=True) if d.get("label") == "Condition"]
        patient_nodes   = [n for n, d in self.G.nodes(data=True) if d.get("label") == "Patient"]

        return {
            "total_nodes":       self.G.number_of_nodes(),
            "total_edges":       self.G.number_of_edges(),
            "factor_count":      len(factor_nodes),
            "condition_count":   len(condition_nodes),
            "patient_count":     len(patient_nodes),
            "is_dag":            nx.is_directed_acyclic_graph(self.G),
            "avg_edge_weight":   round(
                sum(d.get("weight", 0) for _, _, d in self.G.edges(data=True))
                / max(self.G.number_of_edges(), 1), 3
            ),
        }

    # ─────────────────────────────────────────
    # EXPORT FOR FRONTEND (D3 / vis.js / Cytoscape)
    # ─────────────────────────────────────────

    def to_dict(self, patient_id: Optional[str] = None) -> dict:
        """
        Export graph as {nodes, edges} dict.
        If patient_id given, exports only that patient's subgraph.
        """
        G = self.get_patient_subgraph(patient_id) if patient_id else self.G

        label_colors = {
            "Factor":       "#c9938a",
            "Condition":    "#e57373",
            "Intermediate": "#f0c07a",
            "Outcome":      "#81c784",
            "Patient":      "#7986cb",
        }

        nodes = []
        for node_id, data in G.nodes(data=True):
            label = data.get("label", "Unknown")
            nodes.append({
                "id":       node_id,
                "label":    label,
                "name":     data.get("name", node_id),
                "color":    label_colors.get(label, "#aaa"),
                **{k: v for k, v in data.items()
                   if k not in ("label", "name")}
            })

        edges = []
        for u, v, data in G.edges(data=True):
            edges.append({
                "source":         u,
                "target":         v,
                "relationship":   data.get("relationship", ""),
                "weight":         round(data.get("weight", 1.0), 3),
                "clinical_basis": data.get("clinical_basis", ""),
            })

        return {"nodes": nodes, "edges": edges}

    # ─────────────────────────────────────────
    # SERIALISATION
    # ─────────────────────────────────────────

    def save(self, filepath: str):
        """Save graph to JSON (node-link format)."""
        data = nx.node_link_data(self.G, edges="links")
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2, default=str)
        log.info(f"Graph saved → {filepath}")

    def load(self, filepath: str):
        """Load graph from JSON."""
        with open(filepath) as f:
            data = json.load(f)
        self.G = nx.node_link_graph(data, directed=True, multigraph=False)
        log.info(f"Graph loaded ← {filepath}")

    def remove_patient(self, patient_id: str):
        pid = f"Patient:{patient_id}"
        if pid in self.G:
            self.G.remove_node(pid)
            log.info(f"Patient {patient_id} removed.")


# ─────────────────────────────────────────────
# QUICK TEST (no DB needed)
# ─────────────────────────────────────────────

if __name__ == "__main__":
    from dataclasses import dataclass, field

    # Minimal stub of ExplanationResult for standalone test
    @dataclass
    class Factor:
        message: str
        severity: str
        feature: str
        direction: str

    @dataclass
    class ExplanationResult:
        positive_factors: list = field(default_factory=list)
        negative_factors: list = field(default_factory=list)
        neutral_factors:  list = field(default_factory=list)
        missing_features: list = field(default_factory=list)
        confidence_note:  str  = ""

    graph = IVFGraph()

    # Print base graph stats
    stats = graph.get_stats()
    print("\n── Base Graph Stats ──────────────────")
    for k, v in stats.items():
        print(f"  {k:<22} {v}")

    # Critical path
    cp = graph.get_critical_path()
    print(f"\n── Most Influential Path ─────────────")
    print("  " + " → ".join(cp))

    # Top 5 influential nodes
    influence = graph.get_node_influence()
    print(f"\n── Top 5 Influential Nodes ───────────")
    for node, score in list(influence.items())[:5]:
        print(f"  {node:<28} {score:.4f}")

    # Patient subgraph
    features = {
        "age": 37, "amh": 0.7, "fsh": 14.2, "bmi": 28.5,
        "endometrial_thickness": 6.5, "embryo_grade": 2,
        "embryos_created": 2, "oocytes_retrieved": 3,
        "fertilisation_rate": 0.45, "afc": 5,
        "sperm_motility": 0.28, "prior_failures": 2,
    }
    explanation = ExplanationResult(
        negative_factors=[
            Factor("Low AMH",          "high",     "amh",                   "negative"),
            Factor("Advanced age",     "moderate", "age",                   "negative"),
            Factor("High FSH",         "moderate", "fsh",                   "negative"),
            Factor("Thin endometrium", "high",     "endometrial_thickness", "negative"),
            Factor("Poor embryo",      "high",     "embryo_grade",          "negative"),
        ]
    )

    graph.create_patient_subgraph("P001", features, explanation, predicted_prob=0.28)

    paths = graph.get_risk_paths("P001")
    print(f"\n── Risk Paths to IVF Success ({len(paths)} found) ──")
    for p in paths[:4]:
        print("  " + " → ".join(p))

    # Save graph
    graph.save("data/ivf_graph.json")
    print("\n── Graph saved to data/ivf_graph.json")