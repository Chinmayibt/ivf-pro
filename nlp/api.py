from typing import Any, Dict, List, Optional, Union
import os
import tempfile

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from nlp.predict_pipeline import predict, graph as pipeline_graph
from nlp.image_predictor import get_image_predictor
from nlp.appointments import (
    create_appointment,
    list_appointments,
    list_notifications,
    mark_notification_read,
)
from nlp.auth_store import authenticate, example_email_for_role


app = FastAPI(title="IVF Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    input: Union[str, Dict[str, Any]]


class AppointmentCreateRequest(BaseModel):
    patient_id: str
    title: str
    date: str
    time: str
    note: str = ""


class NotificationReadRequest(BaseModel):
    patient_id: str
    notification_id: int


class LoginRequest(BaseModel):
    email: str
    password: str
    role: str


class PositiveFactorItem(BaseModel):
    factor: str
    why_it_matters: str = ""


class ImprovementPlanItem(BaseModel):
    short_term: List[str] = Field(default_factory=list)
    before_next_cycle: List[str] = Field(default_factory=list)
    clinical_options: List[str] = Field(default_factory=list)


class NegativeFactorItem(BaseModel):
    factor: str
    severity: str = "low"
    why_it_matters: str = ""
    impact: str = ""
    how_to_improve: ImprovementPlanItem = Field(default_factory=ImprovementPlanItem)


class ExplanationPayload(BaseModel):
    summary: str = ""
    key_drivers: List[str] = Field(default_factory=list)
    positive_factors: List[PositiveFactorItem] = Field(default_factory=list)
    negative_factors: List[NegativeFactorItem] = Field(default_factory=list)
    personalized_diet: List[str] = Field(default_factory=list)
    personalized_medication: List[str] = Field(default_factory=list)
    final_guidance: str = ""


class GraphPayload(BaseModel):
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    links: List[Dict[str, Any]] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


class PredictionPayload(BaseModel):
    label: str
    probability: float
    confidence: str
    confidence_score: float = 0.0


class PredictionArtifacts(BaseModel):
    original_image: Optional[str] = None
    gradcam_image: Optional[str] = None
    gradcam_status: Optional[str] = None
    gradcam_fallback: Optional[str] = None


class PredictionMeta(BaseModel):
    source_mode: str
    patient_id: str = "P001"
    data_quality: str = "Unknown"


class PredictResponse(BaseModel):
    ok: bool = True
    prediction: PredictionPayload
    explanation: ExplanationPayload
    graph: GraphPayload
    risk_paths: List[List[str]] = Field(default_factory=list)
    critical_path: List[str] = Field(default_factory=list)
    artifacts: PredictionArtifacts = Field(default_factory=PredictionArtifacts)
    meta: PredictionMeta


class AppointmentItem(BaseModel):
    id: int
    patient_id: str
    title: str
    date: str
    time: str
    note: str = ""
    created_by: str = "doctor"
    created_at: str


class NotificationItem(BaseModel):
    id: int
    patient_id: str
    message: str
    appointment_id: Optional[int] = None
    is_read: bool = False
    created_at: str


class AppointmentListResponse(BaseModel):
    appointments: List[AppointmentItem] = Field(default_factory=list)


class AppointmentCreateResponse(BaseModel):
    appointment: AppointmentItem


class NotificationListResponse(BaseModel):
    notifications: List[NotificationItem] = Field(default_factory=list)


class NotificationReadResponse(BaseModel):
    notification: NotificationItem


class AuthUser(BaseModel):
    role: str
    email: str
    id: Optional[str] = None
    name: Optional[str] = None
    display_name: Optional[str] = None
    department: Optional[str] = None
    patient_id: Optional[str] = None


class LoginResponse(BaseModel):
    ok: bool = True
    user: AuthUser


class ExampleEmailResponse(BaseModel):
    email: str


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _normalize_positive_factors(raw_items: Any) -> List[PositiveFactorItem]:
    normalized: List[PositiveFactorItem] = []
    for item in raw_items or []:
        if isinstance(item, str):
            normalized.append(PositiveFactorItem(factor=item))
            continue
        if isinstance(item, dict):
            normalized.append(
                PositiveFactorItem(
                    factor=str(item.get("factor") or item.get("message") or ""),
                    why_it_matters=str(item.get("why_it_matters") or item.get("why") or ""),
                )
            )
    return normalized


def _normalize_negative_factors(raw_items: Any) -> List[NegativeFactorItem]:
    normalized: List[NegativeFactorItem] = []
    for item in raw_items or []:
        if isinstance(item, str):
            normalized.append(NegativeFactorItem(factor=item))
            continue
        if not isinstance(item, dict):
            continue
        improve = item.get("how_to_improve") or {}
        normalized.append(
            NegativeFactorItem(
                factor=str(item.get("factor") or item.get("message") or ""),
                severity=str(item.get("severity") or "low"),
                why_it_matters=str(item.get("why_it_matters") or ""),
                impact=str(item.get("impact") or ""),
                how_to_improve=ImprovementPlanItem(
                    short_term=list(improve.get("short_term") or []),
                    before_next_cycle=list(improve.get("before_next_cycle") or []),
                    clinical_options=list(improve.get("clinical_options") or []),
                ),
            )
        )
    return normalized


def _normalize_explanation(explanation: Any, fallback_summary: str = "") -> ExplanationPayload:
    if isinstance(explanation, str):
        return ExplanationPayload(summary=explanation or fallback_summary)
    payload = explanation or {}
    return ExplanationPayload(
        summary=str(payload.get("summary") or fallback_summary or ""),
        key_drivers=[str(item) for item in (payload.get("key_drivers") or [])],
        positive_factors=_normalize_positive_factors(payload.get("positive_factors")),
        negative_factors=_normalize_negative_factors(payload.get("negative_factors")),
        personalized_diet=[str(item) for item in (payload.get("personalized_diet") or [])],
        personalized_medication=[str(item) for item in (payload.get("personalized_medication") or [])],
        final_guidance=str(payload.get("final_guidance") or ""),
    )


def _build_api_response(result: Dict[str, Any], source_mode: str) -> PredictResponse:
    explanation = _normalize_explanation(result.get("explanation"), result.get("summary", ""))
    graph_payload = result.get("graph") or {}
    if not graph_payload:
        raw = pipeline_graph.get_subgraph_for_visualization("P001")
        graph_payload = {"nodes": raw.get("nodes", []), "links": raw.get("links", []), "meta": {}}

    label = str(result.get("label") or result.get("prediction") or "Unknown")
    probability = _as_float(result.get("final_probability", result.get("probability", 0.0)))
    confidence = str(result.get("confidence") or "Unknown")
    confidence_score = _as_float(result.get("confidence_score"), 0.0)

    artifacts = PredictionArtifacts(
        original_image=result.get("original_image"),
        gradcam_image=result.get("gradcam_image"),
        gradcam_status=result.get("gradcam_status"),
        gradcam_fallback=result.get("gradcam_fallback"),
    )

    return PredictResponse(
        ok=True,
        prediction=PredictionPayload(
            label=label,
            probability=probability,
            confidence=confidence,
            confidence_score=confidence_score,
        ),
        explanation=explanation,
        graph=GraphPayload(
            nodes=list(graph_payload.get("nodes", [])),
            links=list(graph_payload.get("links", [])),
            meta=dict(graph_payload.get("meta", {})),
        ),
        risk_paths=[list(path) for path in (result.get("risk_paths") or [])],
        critical_path=[str(item) for item in (result.get("critical_path") or [])],
        artifacts=artifacts,
        meta=PredictionMeta(
            source_mode=source_mode,
            patient_id=str(result.get("patient_id") or "P001"),
            data_quality=str(result.get("data_quality_confidence") or "Unknown"),
        ),
    )


@app.post("/predict", response_model=PredictResponse)
def predict_endpoint(payload: PredictRequest):
    try:
        result = predict(payload.input)
        return _build_api_response(result, source_mode="manual_or_clinical")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/predict/pdf", response_model=PredictResponse)
async def predict_pdf(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".pdf"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_path = tmp.name

        result = predict(temp_path)
        return _build_api_response(result, source_mode="pdf")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/predict/image", response_model=PredictResponse)
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
        result = predictor.predict_image_bytes(content)
        return _build_api_response(result, source_mode="image")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/auth/login", response_model=LoginResponse)
def auth_login(payload: LoginRequest):
    role = (payload.role or "").strip().lower()
    if role not in {"doctor", "patient"}:
        raise HTTPException(status_code=400, detail="role must be doctor or patient")
    user = authenticate(payload.email, payload.password, role)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password for this role")
    return {"ok": True, "user": user}


@app.get("/auth/example", response_model=ExampleEmailResponse)
def auth_example_email(role: str):
    r = (role or "").strip().lower()
    if r not in {"doctor", "patient"}:
        raise HTTPException(status_code=400, detail="role must be doctor or patient")
    return {"email": example_email_for_role(r)}


@app.get("/appointments", response_model=AppointmentListResponse)
def get_appointments(patient_id: str | None = None):
    return {"appointments": list_appointments(patient_id=patient_id)}


@app.post("/appointments", response_model=AppointmentCreateResponse)
def post_appointment(payload: AppointmentCreateRequest):
    try:
        appointment = create_appointment(
            patient_id=payload.patient_id,
            title=payload.title,
            date=payload.date,
            time=payload.time,
            note=payload.note,
            created_by="doctor",
        )
        return {"appointment": appointment}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/notifications", response_model=NotificationListResponse)
def get_notifications(patient_id: str, unread_only: bool = False):
    return {"notifications": list_notifications(patient_id=patient_id, unread_only=unread_only)}


@app.post("/notifications/read", response_model=NotificationReadResponse)
def post_notification_read(payload: NotificationReadRequest):
    try:
        item = mark_notification_read(
            notification_id=payload.notification_id,
            patient_id=payload.patient_id,
        )
        return {"notification": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
