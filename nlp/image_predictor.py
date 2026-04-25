import io
import base64
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms
from torchvision.transforms import functional as TF

from nlp.config import IVF_IMAGE_MODEL_CONFIG

try:
    from pytorch_grad_cam import GradCAM
    from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
except Exception:
    GradCAM = None
    ClassifierOutputTarget = None

try:
    import cv2
except Exception:
    cv2 = None


def _default_image_response(
    prediction: str,
    confidence: float,
    note: str,
    original_image: str | None = None,
    gradcam_image: str | None = None,
) -> Dict[str, Any]:
    return {
        "label": prediction,
        "final_probability": float(confidence),
        "prediction": prediction,
        "confidence": round(float(confidence), 3),
        "confidence_score": round(float(confidence), 3),
        "data_quality_confidence": "High",
        "explanation": note,
        "probability": float(confidence),
        "original_image": original_image,
        "gradcam_image": gradcam_image,
        "gradcam_status": "available" if gradcam_image else "unavailable",
        "graph": {"nodes": [], "links": []},
        "risk_paths": [],
        "critical_path": [],
        "patient_id": "P001",
    }


def _fallback_image_explanation(base_note: str, prediction: str, confidence: float, region: str = "") -> Dict[str, Any]:
    conf_pct = round(confidence * 100, 1)
    region_note = f" Attention is strongest in the {region}." if region else ""
    return {
        "summary": f"{prediction} detected with {conf_pct}% confidence.{region_note} {base_note}".strip(),
        "key_drivers": [
            f"Predicted class: {prediction}",
            f"Model confidence: {conf_pct}%",
        ],
        "positive_factors": [
            {
                "factor": "Clear visual pattern match",
                "why_it_matters": "The model identified image regions strongly associated with the predicted class.",
            }
        ],
        "negative_factors": [],
        "personalized_diet": [],
        "personalized_medication": [],
        "final_guidance": "Use this image finding together with clinical history and laboratory findings for decisions.",
    }


def _class_name(prediction: str) -> str:
    p = (prediction or "").strip().lower()
    if "preg" in p and "non" in p:
        return "Non-pregnant"
    if "preg" in p:
        return "Pregnant"
    return prediction or "Unknown"


class IVFImagePredictor:
    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.classes = IVF_IMAGE_MODEL_CONFIG["classes"]
        self.model = models.efficientnet_b0(weights=None)
        in_features = self.model.classifier[1].in_features
        self.model.classifier[1] = nn.Linear(in_features, len(self.classes))
        self.model_path = self._resolve_model_path()
        self._load_model()
        self.transform = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            ]
        )

    def _resolve_model_path(self) -> Path:
        root = Path(__file__).resolve().parent.parent
        configured = root / IVF_IMAGE_MODEL_CONFIG["model_path"]
        if configured.exists():
            return configured
        fallback = root / "ivf_model.pth"
        if fallback.exists():
            return fallback
        raise FileNotFoundError(
            f"Image model checkpoint not found at '{configured}' or '{fallback}'"
        )

    def _load_model(self) -> None:
        state = torch.load(self.model_path, map_location=self.device)
        self.model.load_state_dict(state)
        self.model.to(self.device)
        self.model.eval()

    def _build_explanation(self, heatmap: np.ndarray) -> dict[str, Any]:
        h, w = heatmap.shape
        y_coords, x_coords = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
        total_activation = float(heatmap.sum()) + 1e-8
        center_y = float((heatmap * y_coords).sum() / total_activation)
        center_x = float((heatmap * x_coords).sum() / total_activation)
        _ = center_x  # reserved for possible future directional copy.

        if center_y < h * 0.33:
            region = "upper region"
        elif center_y > h * 0.66:
            region = "lower region"
        else:
            region = "central region"

        spread = float(np.var(heatmap))
        spread_desc = "moderately distributed" if spread < 0.03 else "widely distributed"
        coverage = float(np.mean(heatmap > 0.5))
        coverage_desc = "moderate coverage" if coverage < 0.3 else "high coverage"

        explanation = (
            f"The model focuses on the {region}. "
            f"Activation is {spread_desc}. "
            f"Feature coverage is {coverage_desc}. "
            "This may suggest embryo structural characteristics influencing viability."
        )
        return {
            "summary_text": explanation,
            "region": region,
            "spread_desc": spread_desc,
            "coverage_desc": coverage_desc,
            "spread": spread,
            "coverage": coverage,
        }

    def _build_image_reasoning(
        self,
        prediction: str,
        confidence: float,
        heatmap_info: dict[str, Any] | None = None,
        top_classes: list[dict[str, Any]] | None = None,
        gradcam_available: bool = True,
    ) -> Dict[str, Any]:
        pred_label = _class_name(prediction)
        conf_pct = round(confidence * 100, 1)
        region = (heatmap_info or {}).get("region", "")
        coverage_desc = (heatmap_info or {}).get("coverage_desc", "moderate coverage")
        spread_desc = (heatmap_info or {}).get("spread_desc", "moderately distributed")
        heatmap_text = (heatmap_info or {}).get("summary_text", "")

        alt_text = ""
        if top_classes and len(top_classes) > 1:
            alt = top_classes[1]
            alt_label = alt.get("label", "alternate class")
            alt_prob = float(alt.get("probability", 0.0)) * 100
            alt_text = f"Alternative class {alt_label} scored {alt_prob:.1f}%."

        if pred_label.lower().startswith("preg"):
            why_line = (
                "Classified as Pregnant because the image shows stronger model evidence for the pregnant pattern "
                f"({conf_pct:.1f}% confidence) than the non-pregnant pattern."
            )
            positive = [
                {
                    "factor": "Dominant pregnant-pattern probability",
                    "why_it_matters": "The model confidence favors the pregnant class over competing classes.",
                },
                {
                    "factor": "Focused activation map",
                    "why_it_matters": f"Grad-CAM highlights the {region or 'key visual'} region with {coverage_desc} and {spread_desc} activation.",
                },
            ]
            negative = []
        else:
            why_line = (
                "Classified as Non-pregnant because the image aligns more with non-pregnant visual patterns "
                f"({conf_pct:.1f}% confidence) than pregnant-pattern signals."
            )
            positive = [
                {
                    "factor": "Dominant non-pregnant-pattern probability",
                    "why_it_matters": "The model confidence is higher for non-pregnant class features.",
                }
            ]
            negative = [
                {
                    "factor": "Lower pregnant-pattern confidence",
                    "severity": "moderate",
                    "why_it_matters": "Visual evidence for pregnant class is weaker than non-pregnant cues.",
                    "impact": "Reduces confidence toward a pregnant classification in this image-only analysis.",
                    "how_to_improve": {
                        "short_term": [
                            "Retake high-quality, well-centered embryo imagery with consistent lighting.",
                        ],
                        "before_next_cycle": [
                            "Compare serial images across time points to assess pattern stability.",
                        ],
                        "clinical_options": [
                            "Review image result together with hormone values and clinical timeline.",
                        ],
                    },
                }
            ]

        guidance = (
            "Use this as image-based decision support only; combine with clinical and lab context before final conclusions."
        )
        if not gradcam_available:
            guidance = (
                f"{guidance} Grad-CAM visualization is unavailable in this environment, so interpret confidence conservatively."
            )

        key_drivers = [
            f"Predicted class: {pred_label}",
            f"Image confidence: {conf_pct:.1f}%",
            f"Attention focus: {region or 'not available'}",
            alt_text,
        ]

        return {
            "summary": f"{why_line} {heatmap_text}".strip(),
            "key_drivers": [line for line in key_drivers if line],
            "positive_factors": positive,
            "negative_factors": negative,
            "personalized_diet": [],
            "personalized_medication": [],
            "final_guidance": guidance,
        }

    def _compute_gradcam(self, input_tensor: torch.Tensor, pred_idx: int) -> np.ndarray | None:
        if not IVF_IMAGE_MODEL_CONFIG.get("enable_gradcam", True):
            return None
        if GradCAM is None or ClassifierOutputTarget is None or cv2 is None:
            return None

        target_layers = [self.model.features[-2]]
        cam = GradCAM(model=self.model, target_layers=target_layers)
        targets = [ClassifierOutputTarget(pred_idx)]
        grayscale_cam = cam(input_tensor=input_tensor, targets=targets)[0]
        grayscale_cam = cv2.GaussianBlur(grayscale_cam, (15, 15), 0)
        heatmap = (grayscale_cam - grayscale_cam.min()) / (
            grayscale_cam.max() - grayscale_cam.min() + 1e-8
        )
        return heatmap

    def _to_data_uri(self, image_array: np.ndarray) -> str | None:
        if cv2 is None:
            return None
        ok, encoded = cv2.imencode(".png", image_array)
        if not ok:
            return None
        b64 = base64.b64encode(encoded.tobytes()).decode("utf-8")
        return f"data:image/png;base64,{b64}"

    def _pil_to_data_uri(self, image: Image.Image) -> str | None:
        try:
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return f"data:image/png;base64,{b64}"
        except Exception:
            return None

    def _predict_with_tta(self, image: Image.Image) -> tuple[torch.Tensor, int, float]:
        """
        Use light TTA (original + horizontal flip) to reduce prediction instability.
        Returns averaged probabilities, predicted index, and predicted confidence.
        """
        variants = [image, TF.hflip(image)]
        batch = torch.stack([self.transform(img) for img in variants], dim=0).to(self.device)
        with torch.no_grad():
            output = self.model(batch)
            probs = torch.softmax(output, dim=1)
            probs_mean = probs.mean(dim=0)
            pred_idx = int(torch.argmax(probs_mean).item())
            confidence = float(probs_mean[pred_idx].item())
        return probs_mean, pred_idx, confidence

    def predict_image_bytes(self, image_bytes: bytes) -> Dict[str, Any]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(image)
        input_tensor = self.transform(image).unsqueeze(0).to(self.device)
        probs_mean, pred_idx, confidence = self._predict_with_tta(image)
        prob_arr = probs_mean.detach().cpu().numpy()

        prediction = self.classes[pred_idx]
        top_order = np.argsort(prob_arr)[::-1]
        top_classes = [
            {"label": self.classes[int(idx)], "probability": float(prob_arr[int(idx)])}
            for idx in top_order[: min(2, len(top_order))]
        ]
        heatmap = self._compute_gradcam(input_tensor, pred_idx)
        original_uri = self._to_data_uri(cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)) if cv2 is not None else self._pil_to_data_uri(image)

        if heatmap is None:
            response = _default_image_response(
                prediction,
                confidence,
                "",
                original_image=original_uri,
            )
            response["explanation"] = self._build_image_reasoning(
                prediction,
                confidence,
                heatmap_info=None,
                top_classes=top_classes,
                gradcam_available=False,
            )
            response["gradcam_fallback"] = "Grad-CAM dependency unavailable; showing original image only."
            return response

        heatmap_info = self._build_explanation(heatmap)
        explanation = self._build_image_reasoning(
            prediction,
            confidence,
            heatmap_info=heatmap_info,
            top_classes=top_classes,
            gradcam_available=True,
        )
        if cv2 is not None:
            resized_rgb = cv2.resize(image_np, (224, 224))
            heatmap_uint8 = np.uint8(np.clip(heatmap, 0, 1) * 255)
            heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
            overlay_bgr = cv2.addWeighted(
                cv2.cvtColor(resized_rgb, cv2.COLOR_RGB2BGR),
                0.55,
                heatmap_color,
                0.45,
                0,
            )
            gradcam_uri = self._to_data_uri(overlay_bgr)
            original_resized_uri = self._to_data_uri(cv2.cvtColor(resized_rgb, cv2.COLOR_RGB2BGR))
        else:
            gradcam_uri = None
            original_resized_uri = original_uri

        response = _default_image_response(
            prediction,
            confidence,
            "",
            original_image=original_resized_uri,
            gradcam_image=gradcam_uri,
        )
        response["explanation"] = explanation
        if gradcam_uri is None:
            response["gradcam_fallback"] = "Grad-CAM render failed; explanation is based on computed heatmap."
        return response


_PREDICTOR: IVFImagePredictor | None = None


def get_image_predictor() -> IVFImagePredictor:
    global _PREDICTOR
    if _PREDICTOR is None:
        _PREDICTOR = IVFImagePredictor()
    return _PREDICTOR
