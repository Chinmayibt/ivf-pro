# IVF Decision Support and Prediction Platform

A full-stack IVF assistance project that combines:
- a FastAPI backend for prediction, explanation, auth, appointments, and notifications
- a React + Vite frontend for interactive clinician/patient workflows
- knowledge-graph based relationship views for risk and treatment context

## What This Project Provides

- Multi-input prediction APIs:
  - structured/manual clinical input
  - PDF upload
  - embryo/lab image upload (with Grad-CAM artifacts when available)
- Rich explanation payloads:
  - summary and key drivers
  - positive and negative factors
  - practical improvement guidance
- Demo authentication for doctor and patient roles
- Appointment creation and per-patient notification tracking
- Graph payload support for front-end visualization of IVF-related entities and links

## Tech Stack

- **Backend:** Python, FastAPI, Uvicorn, scikit-learn, PyTorch ecosystem, NLP/ML utilities
- **Frontend:** React, Vite, Cytoscape, Framer Motion
- **Data/Artifacts:** JSON stores under `data/`, model artifacts under `model/` and `models/`

## Repository Structure

- `nlp/` - API, prediction pipeline, explainability, auth, appointments
- `kg/` - IVF graph building and graph-related utilities
- `frontend/` - React application (UI, API client, graph and result components)
- `data/` - graph and appointment stores, plus raw/processed data files
- `model/`, `models/` - trained model assets and metrics

## Prerequisites

- Python 3.10+ (recommended)
- Node.js 18+ and npm

## Backend Setup (FastAPI)

1. Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Install Python dependencies:

```bash
pip install -r requiremnts.txt
```

3. Start the backend:

```bash
uvicorn nlp.api:app --reload --port 8000
```

API base URL: `http://localhost:8000`

Interactive docs:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Frontend Setup (React + Vite)

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Start the frontend:

```bash
npm run dev
```

Default frontend URL: `http://localhost:5173`

## Core API Endpoints

- `POST /predict` - prediction from structured/manual input
- `POST /predict/pdf` - prediction from PDF file upload
- `POST /predict/image` - prediction from image upload
- `POST /auth/login` - demo login (`doctor` or `patient`)
- `GET /auth/example` - fetch example email for a role
- `GET /appointments` - list appointments (optional `patient_id`)
- `POST /appointments` - create appointment
- `GET /notifications` - list notifications for a patient
- `POST /notifications/read` - mark a notification as read

## Development Notes

- Frontend API calls currently target `http://localhost:8000` directly.
- Appointment and graph data are persisted in JSON files under `data/`.
- Keep model files and large binary artifacts out of commits unless needed.
- `requiremnts.txt` is intentionally referenced by current scripts; keep naming consistent unless you plan a coordinated rename.

## Suggested Run Order

1. Start backend (`uvicorn ... --port 8000`)
2. Start frontend (`npm run dev` inside `frontend/`)
3. Open the frontend in browser and run a prediction flow
4. Inspect API docs at `/docs` for endpoint-level testing

## License

No license file is currently declared in this repository.
