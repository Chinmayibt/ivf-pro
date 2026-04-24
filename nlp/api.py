from typing import Any, Dict, List, Union
import os
import tempfile
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from nlp.predict_pipeline import predict, split_drivers_and_lists, short_why
from kg.ivf_graph import IVFGraph


app = FastAPI(title="IVF Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    input: Union[str, Dict[str, Any]]


graph = IVFGraph()


def _build_api_response(result: Dict[str, Any]) -> Dict[str, Any]:
    explanation = result["explanation"]
    drivers_pos, drivers_neg, _, _ = split_drivers_and_lists(explanation)
    key_drivers: List[str] = [f.message for f in drivers_pos + drivers_neg]

    patient_id = f"P{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    graph.create_patient_subgraph(
        patient_id=patient_id,
        features=result["features"],
        explanation_result=explanation,
        predicted_prob=result["final_probability"],
    )
    risk_paths = graph.get_risk_paths(patient_id)
    critical_path = graph.get_critical_path()
    graph_data = graph.get_subgraph_for_visualization(patient_id)
    links = [
        {"source": edge[0], "target": edge[1]}
        for edge in graph_data.get("edges", [])
    ]

    return {
        "prediction": result["label"],
        "probability": result["final_probability"],
        "confidence": result["confidence"],
        "explanation": {
            "summary": result["summary"],
            "why": short_why(drivers_pos, drivers_neg),
            "positive_factors": [f.message for f in explanation.positive_factors],
            "negative_factors": [f.message for f in explanation.negative_factors],
            "key_drivers": key_drivers,
        },
        "graph": {
            "nodes": graph_data.get("nodes", []),
            "links": links,
        },
        "risk_paths": risk_paths,
        "critical_path": critical_path,
    }


@app.post("/predict")
def predict_endpoint(payload: PredictRequest):
    try:
        result = predict(payload.input)
        return _build_api_response(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/predict/pdf")
async def predict_pdf(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".pdf"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_path = tmp.name

        result = predict(temp_path)
        return _build_api_response(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
