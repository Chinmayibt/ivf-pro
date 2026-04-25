"""
Evaluate IVF image classification checkpoint on a labeled folder dataset.

Expected dataset layout:
  <dataset_root>/
    Non-pregnant/
      img1.png ...
    Pregnant/
      img2.png ...

Usage:
  .venv/bin/python nlp/eval_image_model.py --dataset /path/to/dataset
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

from nlp.config import IVF_IMAGE_MODEL_CONFIG


def resolve_model_path(root: Path) -> Path:
    configured = root / IVF_IMAGE_MODEL_CONFIG["model_path"]
    if configured.exists():
        return configured
    fallback = root / "ivf_model.pth"
    if fallback.exists():
        return fallback
    raise FileNotFoundError(
        f"Image model checkpoint not found at '{configured}' or '{fallback}'"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to labeled image dataset root")
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    dataset_root = Path(args.dataset).expanduser().resolve()
    if not dataset_root.exists():
        raise FileNotFoundError(f"Dataset path does not exist: {dataset_root}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    classes = IVF_IMAGE_MODEL_CONFIG["classes"]

    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ]
    )
    dataset = datasets.ImageFolder(dataset_root, transform=transform)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, len(classes))
    model_path = resolve_model_path(root)
    state = torch.load(model_path, map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()

    y_true: list[int] = []
    y_pred: list[int] = []
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            preds = torch.argmax(logits, dim=1)
            y_true.extend(labels.cpu().tolist())
            y_pred.extend(preds.cpu().tolist())

    acc = accuracy_score(y_true, y_pred)
    report = classification_report(
        y_true,
        y_pred,
        target_names=dataset.classes,
        digits=4,
        zero_division=0,
        output_dict=True,
    )
    cm = confusion_matrix(y_true, y_pred).tolist()

    metrics = {
        "dataset": str(dataset_root),
        "model_path": str(model_path),
        "classes": dataset.classes,
        "n_samples": len(dataset),
        "accuracy": float(acc),
        "confusion_matrix": cm,
        "classification_report": report,
    }

    print(f"Accuracy: {acc:.4f}")
    print("Confusion matrix:")
    print(cm)
    print(json.dumps(metrics, indent=2))

    out_path = root / "model" / "image_eval_metrics.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved metrics to {out_path}")


if __name__ == "__main__":
    main()
