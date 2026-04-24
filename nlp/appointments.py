import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parent.parent
STORE_PATH = ROOT / "data" / "appointments_store.json"
_LOCK = threading.Lock()


def _default_store() -> Dict[str, Any]:
    return {
        "appointments": [],
        "notifications": [],
        "last_appointment_id": 0,
        "last_notification_id": 0,
    }


def _load_store() -> Dict[str, Any]:
    if not STORE_PATH.exists():
        return _default_store()
    try:
        with STORE_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return _default_store()
    if not isinstance(payload, dict):
        return _default_store()
    return {**_default_store(), **payload}


def _save_store(payload: Dict[str, Any]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STORE_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def list_appointments(patient_id: str | None = None) -> List[Dict[str, Any]]:
    with _LOCK:
        payload = _load_store()
        appointments = payload.get("appointments", [])
    if patient_id:
        appointments = [item for item in appointments if item.get("patient_id") == patient_id]
    return sorted(appointments, key=lambda item: (item.get("date", ""), item.get("time", "")))


def create_appointment(
    patient_id: str,
    title: str,
    date: str,
    time: str,
    note: str = "",
    created_by: str = "doctor",
) -> Dict[str, Any]:
    timestamp = datetime.utcnow().isoformat() + "Z"
    with _LOCK:
        payload = _load_store()
        payload["last_appointment_id"] += 1
        appointment = {
            "id": payload["last_appointment_id"],
            "patient_id": patient_id,
            "title": title,
            "date": date,
            "time": time,
            "note": note,
            "created_by": created_by,
            "created_at": timestamp,
        }
        payload["appointments"].append(appointment)

        payload["last_notification_id"] += 1
        payload["notifications"].append(
            {
                "id": payload["last_notification_id"],
                "patient_id": patient_id,
                "message": f"New appointment: {title} on {date} at {time}",
                "appointment_id": appointment["id"],
                "is_read": False,
                "created_at": timestamp,
            }
        )
        _save_store(payload)
    return appointment


def list_notifications(patient_id: str, unread_only: bool = False) -> List[Dict[str, Any]]:
    with _LOCK:
        payload = _load_store()
        notifications = [
            item for item in payload.get("notifications", []) if item.get("patient_id") == patient_id
        ]
    if unread_only:
        notifications = [item for item in notifications if not item.get("is_read")]
    return sorted(notifications, key=lambda item: item.get("created_at", ""), reverse=True)


def mark_notification_read(notification_id: int, patient_id: str) -> Dict[str, Any]:
    with _LOCK:
        payload = _load_store()
        target = None
        for item in payload.get("notifications", []):
            if item.get("id") == notification_id and item.get("patient_id") == patient_id:
                item["is_read"] = True
                target = item
                break
        if target is None:
            raise ValueError("Notification not found")
        _save_store(payload)
    return target
