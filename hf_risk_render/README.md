# HF-RISK Live Tool for Render

This folder contains the public research prototype for HF-RISK.

## What it does
- Serves a browser-based Flask app for the live HF-RISK tool
- Runs the final leakage-clean models for 28-day death, 3-month death, 6-month death, and 6-month readmission
- Generates patient-level SHAP explanations for the 6-month mortality model
- Supports embedding inside the Netlify HF-RISK case-study page

## Deploy on Render
1. Push this repository to GitHub.
2. In Render, create a new Web Service from the repo.
3. Set the service root directory to `hf_risk_render`.
4. Use:
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app`
5. Set environment variables:
   - `PUBLIC_TOOL_URL=https://YOUR-RENDER-URL.onrender.com`
   - `PARENT_ORIGINS=https://realnik.co.uk,https://www.realnik.co.uk,https://realnik.netlify.app,http://localhost:3000`

## Local run
```bash
cd hf_risk_render
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

## Endpoints
- `/` full tool page
- `/?embed=1` compact embedded page
- `/api/predict` JSON inference endpoint
- `/health` service health check
