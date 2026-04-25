function normalizePredictionPayload(body) {
  const prediction = body?.prediction || {};
  const explanation = body?.explanation || {};
  const artifacts = body?.artifacts || {};
  const graph = body?.graph || { nodes: [], links: [], meta: {} };

  return {
    prediction: prediction.label || "Unknown",
    probability: prediction.probability ?? 0,
    confidence: prediction.confidence || "Unknown",
    confidence_score: prediction.confidence_score ?? 0,
    explanation,
    graph,
    risk_paths: body?.risk_paths || [],
    critical_path: body?.critical_path || [],
    original_image: artifacts.original_image || null,
    gradcam_image: artifacts.gradcam_image || null,
    gradcam_status: artifacts.gradcam_status || null,
    gradcam_fallback: artifacts.gradcam_fallback || null,
    meta: body?.meta || {},
  };
}

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

  const body = await res.json();
  return normalizePredictionPayload(body);
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

  const body = await res.json();
  return normalizePredictionPayload(body);
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

  const body = await res.json();
  return normalizePredictionPayload(body);
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

export async function loginDemo({ email, password, role }) {
  const res = await fetch("http://localhost:8000/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Login failed");
  }
  return body;
}

export async function getLoginExampleEmail(role) {
  const res = await fetch(`http://localhost:8000/auth/example?role=${encodeURIComponent(role)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Could not load example email");
  }
  return body;
}
