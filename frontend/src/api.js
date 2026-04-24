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
