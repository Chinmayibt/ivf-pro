import io
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

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


def _default_image_response(prediction: str, confidence: float, note: str) -> Dict[str, Any]:
    return {
        "prediction": prediction,
        "confidence": round(float(confidence), 3),
        "explanation": note,
        "probability": float(confidence),
        "graph": {"nodes": [], "links": []},
        "risk_paths": [],
        "critical_path": [],
    }


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

    def _build_explanation(self, heatmap: np.ndarray) -> str:
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

        return (
            f"The model focuses on the {region}. "
            f"Activation is {spread_desc}. "
            f"Feature coverage is {coverage_desc}. "
            "This may suggest embryo structural characteristics influencing viability."
        )

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

    def predict_image_bytes(self, image_bytes: bytes) -> Dict[str, Any]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        input_tensor = self.transform(image).unsqueeze(0).to(self.device)

        with torch.no_grad():
            output = self.model(input_tensor)
            probs = torch.softmax(output, dim=1)
            pred_idx = int(torch.argmax(probs, dim=1).item())
            confidence = float(probs[0][pred_idx].item())

        prediction = self.classes[pred_idx]
        heatmap = self._compute_gradcam(input_tensor, pred_idx)
        if heatmap is None:
            return _default_image_response(
                prediction,
                confidence,
                "Image prediction completed. Grad-CAM is currently unavailable in this environment.",
            )

        explanation = self._build_explanation(heatmap)
        return _default_image_response(prediction, confidence, explanation)


_PREDICTOR: IVFImagePredictor | None = None


def get_image_predictor() -> IVFImagePredictor:
    global _PREDICTOR
    if _PREDICTOR is None:
        _PREDICTOR = IVFImagePredictor()
    return _PREDICTOR
