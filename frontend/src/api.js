export async function getPrediction(input) {
  const res = await fetch("http://localhost:8000/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || "Backend request failed");
  }

  return res.json();
}

export async function getPredictionFromPdf(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch("http://localhost:8000/predict/pdf", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || "Backend PDF request failed");
  }

  return res.json();
}

export async function getPredictionFromImage(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch("http://localhost:8000/predict/image", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || "Backend image request failed");
  }

  return res.json();
}

export async function createAppointment(payload) {
  const res = await fetch("http://localhost:8000/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to create appointment");
  }
  return res.json();
}

export async function getAppointments(patientId) {
  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  const res = await fetch(`http://localhost:8000/appointments${query}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to load appointments");
  }
  return res.json();
}

export async function getNotifications(patientId, unreadOnly = false) {
  const query = `?patient_id=${encodeURIComponent(patientId)}&unread_only=${String(unreadOnly)}`;
  const res = await fetch(`http://localhost:8000/notifications${query}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to load notifications");
  }
  return res.json();
}

export async function markNotificationRead(patientId, notificationId) {
  const res = await fetch("http://localhost:8000/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patient_id: patientId, notification_id: notificationId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to mark notification read");
  }
  return res.json();
}
