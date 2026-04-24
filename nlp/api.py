from typing import Any, Dict, Union
import os
import tempfile

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from nlp.predict_pipeline import predict, graph as pipeline_graph
from nlp.image_predictor import get_image_predictor


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


def _build_api_response(result: Dict[str, Any]) -> Dict[str, Any]:
    explanation = result["explanation"]
    graph_data = pipeline_graph.get_subgraph_for_visualization("P001")
    links = [
        {"source": edge[0], "target": edge[1]}
        for edge in graph_data.get("edges", [])
    ]

    return {
        "prediction": result["label"],
        "probability": result["final_probability"],
        "confidence": result["confidence"],
        "explanation": {
            "summary": explanation.get("summary", result.get("summary", "")),
            "key_drivers": explanation.get("key_drivers", []),
            "positive_factors": explanation.get("positive_factors", []),
            "negative_factors": explanation.get("negative_factors", []),
            "final_guidance": explanation.get("final_guidance", ""),
        },
        "graph": {
            "nodes": graph_data.get("nodes", []),
            "links": links,
        },
        "risk_paths": result.get("risk_paths", []),
        "critical_path": result.get("critical_path", []),
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


@app.post("/predict/image")
async def predict_image(file: UploadFile = File(...)):
    allowed_types = {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/bmp",
    }
    if file.content_type and file.content_type.lower() not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use JPG, PNG, WEBP, or BMP.")

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")
        predictor = get_image_predictor()
        return predictor.predict_image_bytes(content)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
