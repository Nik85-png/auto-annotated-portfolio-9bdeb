import json
import math
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
from flask import Flask, jsonify, render_template, request
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.pipeline import Pipeline as SkPipeline

BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
OUTPUTS_DIR = ARTIFACTS_DIR / "outputs"

PORT = int(os.getenv("PORT", "8000"))
PARENT_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "PARENT_ORIGINS",
        "https://realnik.co.uk,https://www.realnik.co.uk,https://realnik.netlify.app,http://localhost:3000",
    ).split(",")
    if origin.strip()
]
PUBLIC_TOOL_URL = os.getenv("PUBLIC_TOOL_URL", "https://hf-risk-live.onrender.com")

app = Flask(__name__)

OUTCOME_DISPLAY = {
    "28d_death": "28-day mortality",
    "3m_death": "3-month mortality",
    "6m_death": "6-month mortality",
    "6m_readmission": "6-month readmission",
}
OUTCOME_ORDER = ["28d_death", "3m_death", "6m_death", "6m_readmission"]
AGE_BANDS = ["21-29", "29-39", "39-49", "49-59", "59-69", "69-79", "79-89", "89-110"]
AGE_BAND_TO_CODE = {label: idx for idx, label in enumerate(AGE_BANDS)}
GENDER_TO_CODE = {"female": 0, "male": 1}
NYHA_TO_CODE = {"ii": 0, "iii": 1, "iv": 2}
BOOLEAN_FIELDS = ["ckd", "diabetes", "liver_disease"]
NUMERIC_FIELDS = {
    "gcs",
    "eye_opening",
    "movement",
    "pulse",
    "body_temperature",
    "bnp",
    "lvef",
    "creatinine",
    "sodium",
    "potassium",
    "albumin",
    "troponin",
    "lv_diameter",
    "mitral_ams",
}
FIELD_GROUPS = [
    {
        "title": "Clinical status",
        "fields": [
            {"name": "age_band", "label": "Age band", "type": "select", "options": AGE_BANDS, "default": "69-79"},
            {"name": "gender", "label": "Gender", "type": "select", "options": ["Female", "Male"], "default": "Female"},
            {"name": "nyha", "label": "NYHA class", "type": "select", "options": ["II", "III", "IV"], "default": "III"},
            {"name": "gcs", "label": "Glasgow Coma Scale", "type": "number", "min": 3, "max": 15, "step": 1, "default": 15},
            {"name": "eye_opening", "label": "Eye opening", "type": "number", "min": 1, "max": 4, "step": 1, "default": 4},
            {"name": "movement", "label": "Motor response", "type": "number", "min": 1, "max": 6, "step": 1, "default": 6},
            {"name": "pulse", "label": "Pulse (bpm)", "type": "number", "min": 30, "max": 220, "step": 1, "default": 82},
            {"name": "body_temperature", "label": "Body temperature (°C)", "type": "number", "min": 34, "max": 42, "step": 0.1, "default": 36.3},
        ],
    },
    {
        "title": "Cardiac and laboratory markers",
        "fields": [
            {"name": "bnp", "label": "BNP (pg/mL)", "type": "number", "min": 0, "max": 5000, "step": 1, "default": 753},
            {"name": "lvef", "label": "LVEF (%)", "type": "number", "min": 5, "max": 85, "step": 1, "default": 35},
            {"name": "creatinine", "label": "Creatinine (µmol/L)", "type": "number", "min": 10, "max": 1200, "step": 0.1, "default": 87.4},
            {"name": "sodium", "label": "Sodium (mmol/L)", "type": "number", "min": 100, "max": 170, "step": 0.1, "default": 139},
            {"name": "potassium", "label": "Potassium (mmol/L)", "type": "number", "min": 1.5, "max": 12, "step": 0.01, "default": 3.88},
            {"name": "albumin", "label": "Albumin (g/L)", "type": "number", "min": 5, "max": 60, "step": 0.1, "default": 36.8},
            {"name": "troponin", "label": "High-sensitivity troponin", "type": "number", "min": 0, "max": 30, "step": 0.001, "default": 0.055},
            {"name": "lv_diameter", "label": "LV end-diastolic diameter (mm)", "type": "number", "min": 10, "max": 100, "step": 0.1, "default": 51.9},
            {"name": "mitral_ams", "label": "Mitral valve AMS", "type": "number", "min": 0, "max": 5, "step": 0.01, "default": 0.79},
        ],
    },
    {
        "title": "Comorbidities",
        "fields": [
            {"name": "ckd", "label": "Moderate-to-severe CKD", "type": "boolean", "default": True},
            {"name": "diabetes", "label": "Diabetes", "type": "boolean", "default": False},
            {"name": "liver_disease", "label": "Liver disease", "type": "boolean", "default": False},
        ],
    },
]
HUMAN_LABELS = {
    "ageCat": "Age band",
    "gender": "Gender",
    "NYHA.cardiac.function.classification": "NYHA class",
    "GCS": "Glasgow Coma Scale",
    "eye.opening": "Eye opening",
    "movement": "Motor response",
    "pulse": "Pulse",
    "body.temperature": "Body temperature",
    "brain.natriuretic.peptide": "BNP",
    "log_bnp": "log(BNP)",
    "high_bnp_flag": "High BNP flag",
    "LVEF": "LVEF",
    "reduced_ef_flag": "Reduced EF flag",
    "creatinine.enzymatic.method": "Creatinine",
    "log_creatinine": "log(Creatinine)",
    "sodium": "Sodium",
    "sodium.ion": "Sodium (ion)",
    "potassium": "Potassium",
    "potassium.ion": "Potassium (ion)",
    "albumin": "Albumin",
    "high.sensitivity.troponin": "High-sensitivity troponin",
    "left.ventricular.end.diastolic.diameter.LV": "LV end-diastolic diameter",
    "mitral.valve.AMS": "Mitral valve AMS",
    "moderate.to.severe.chronic.kidney.disease": "Moderate-to-severe CKD",
    "renal_risk_flag": "Renal risk flag",
    "diabetes": "Diabetes",
    "liver.disease": "Liver disease",
    "congestive.heart.failure": "Congestive heart failure",
}


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def get_classifier(model):
    if isinstance(model, (ImbPipeline, SkPipeline)):
        return model.named_steps.get("clf") or model[-1]
    return model


def sanitize_payload(payload):
    cleaned = {}
    for key, value in (payload or {}).items():
        if key in BOOLEAN_FIELDS:
            cleaned[key] = bool(value)
        elif key in NUMERIC_FIELDS:
            try:
                cleaned[key] = float(value)
            except (TypeError, ValueError):
                cleaned[key] = None
        else:
            cleaned[key] = value
    return cleaned


def pretty_name(raw_name: str) -> str:
    if raw_name in HUMAN_LABELS:
        return HUMAN_LABELS[raw_name]
    return raw_name.replace(".", " ").replace("_", " ").strip().title()


feature_names_df = pd.read_csv(OUTPUTS_DIR / "feature_names.csv")
if "feature" in feature_names_df.columns:
    FEATURE_NAMES = feature_names_df["feature"].tolist()
else:
    FEATURE_NAMES = feature_names_df.iloc[:, 0].tolist()

FEATURE_NAME_MAP = load_json(OUTPUTS_DIR / "feature_name_map.json")
REVERSE_FEATURE_MAP = {v: k for k, v in FEATURE_NAME_MAP.items()}
MODEL_FEATURE_NAMES = [FEATURE_NAME_MAP.get(feature, feature) for feature in FEATURE_NAMES]
BEST_INFO = load_json(OUTPUTS_DIR / "best_models_info.json")
X_TRAIN = pd.read_csv(OUTPUTS_DIR / "X_train.csv")
FEATURE_DEFAULTS = X_TRAIN.median(numeric_only=True).to_dict()

MODELS = {}
CLASSIFIERS = {}
for outcome in OUTCOME_ORDER:
    model = joblib.load(MODELS_DIR / f"best_model_{outcome}.pkl")
    MODELS[outcome] = model
    CLASSIFIERS[outcome] = get_classifier(model)

SHAP_EXPLAINER = shap.TreeExplainer(CLASSIFIERS["6m_death"])


def build_feature_row(payload):
    row = {feature: float(FEATURE_DEFAULTS.get(feature, 0.0)) for feature in FEATURE_NAMES}
    if "congestive.heart.failure" in row:
        row["congestive.heart.failure"] = 1.0

    age_band = str(payload.get("age_band") or "69-79")
    if "ageCat" in row:
        row["ageCat"] = float(AGE_BAND_TO_CODE.get(age_band, FEATURE_DEFAULTS.get("ageCat", 5.0)))

    gender = str(payload.get("gender") or "Female").strip().lower()
    if "gender" in row:
        row["gender"] = float(GENDER_TO_CODE.get(gender, FEATURE_DEFAULTS.get("gender", 0.0)))

    nyha = str(payload.get("nyha") or "III").strip().lower()
    if "NYHA.cardiac.function.classification" in row:
        row["NYHA.cardiac.function.classification"] = float(
            NYHA_TO_CODE.get(nyha, FEATURE_DEFAULTS.get("NYHA.cardiac.function.classification", 1.0))
        )

    direct_assignments = {
        "GCS": payload.get("gcs"),
        "eye.opening": payload.get("eye_opening"),
        "movement": payload.get("movement"),
        "pulse": payload.get("pulse"),
        "body.temperature": payload.get("body_temperature"),
        "brain.natriuretic.peptide": payload.get("bnp"),
        "LVEF": payload.get("lvef"),
        "creatinine.enzymatic.method": payload.get("creatinine"),
        "sodium": payload.get("sodium"),
        "sodium.ion": payload.get("sodium"),
        "potassium": payload.get("potassium"),
        "potassium.ion": payload.get("potassium"),
        "albumin": payload.get("albumin"),
        "high.sensitivity.troponin": payload.get("troponin"),
        "left.ventricular.end.diastolic.diameter.LV": payload.get("lv_diameter"),
        "mitral.valve.AMS": payload.get("mitral_ams"),
        "moderate.to.severe.chronic.kidney.disease": 1.0 if payload.get("ckd") else 0.0,
        "diabetes": 1.0 if payload.get("diabetes") else 0.0,
        "liver.disease": 1.0 if payload.get("liver_disease") else 0.0,
    }
    for feature, value in direct_assignments.items():
        if feature in row and value is not None:
            row[feature] = float(value)

    bnp_value = row.get("brain.natriuretic.peptide", 0.0)
    if "log_bnp" in row:
        row["log_bnp"] = math.log1p(max(bnp_value, 0.0))
    if "high_bnp_flag" in row:
        row["high_bnp_flag"] = 1.0 if bnp_value > 400 else 0.0

    creatinine_value = row.get("creatinine.enzymatic.method", 0.0)
    if "log_creatinine" in row:
        row["log_creatinine"] = math.log1p(max(creatinine_value, 0.0))

    lvef_value = row.get("LVEF", FEATURE_DEFAULTS.get("LVEF", 52.0))
    if "reduced_ef_flag" in row:
        row["reduced_ef_flag"] = 1.0 if lvef_value < 40 else 0.0

    if "renal_risk_flag" in row:
        row["renal_risk_flag"] = 1.0 if payload.get("ckd") else 0.0

    human_frame = pd.DataFrame([row], columns=FEATURE_NAMES)
    model_frame = human_frame.rename(columns=FEATURE_NAME_MAP).reindex(columns=MODEL_FEATURE_NAMES, fill_value=0.0)
    return human_frame, model_frame


def shap_payload(model_frame):
    shap_values_raw = SHAP_EXPLAINER.shap_values(model_frame)
    if isinstance(shap_values_raw, list):
        shap_values = shap_values_raw[1]
    else:
        shap_values = shap_values_raw
    values = np.asarray(shap_values)[0]

    contributions = []
    for idx, shap_value in enumerate(values):
        model_feature = MODEL_FEATURE_NAMES[idx]
        raw_feature = REVERSE_FEATURE_MAP.get(model_feature, model_feature)
        contributions.append(
            {
                "feature": pretty_name(raw_feature),
                "raw_feature": raw_feature,
                "value": float(model_frame.iloc[0, idx]),
                "shap_value": float(shap_value),
                "direction": "risk_up" if shap_value >= 0 else "risk_down",
            }
        )

    sorted_abs = sorted(contributions, key=lambda item: abs(item["shap_value"]), reverse=True)
    positive = [item for item in sorted_abs if item["shap_value"] > 0][:5]
    negative = [item for item in sorted_abs if item["shap_value"] < 0][:5]
    return {
        "top_positive": positive,
        "top_negative": negative,
        "top_absolute": sorted_abs[:10],
    }


def prediction_payload(model_frame):
    rows = []
    for outcome in OUTCOME_ORDER:
        probability = float(MODELS[outcome].predict_proba(model_frame)[:, 1][0])
        rows.append(
            {
                "outcome": outcome,
                "label": OUTCOME_DISPLAY[outcome],
                "probability": probability,
                "percent": round(probability * 100, 1),
                "model_name": BEST_INFO.get(outcome, {}).get("name", "Model"),
                "internal_auc": BEST_INFO.get(outcome, {}).get("test_auc"),
            }
        )
    return rows


@app.after_request
def set_frame_headers(response):
    if PARENT_ORIGINS:
        response.headers["Content-Security-Policy"] = "frame-ancestors " + " ".join(PARENT_ORIGINS)
    return response


@app.route("/health")
def health():
    return jsonify({"ok": True, "models": list(MODELS.keys())})


@app.route("/")
def index():
    embed = request.args.get("embed", "").lower() in {"1", "true", "yes"}
    return render_template("index.html", embed=embed, field_groups=FIELD_GROUPS, public_tool_url=PUBLIC_TOOL_URL)


@app.route("/api/predict", methods=["POST"])
def predict():
    payload = sanitize_payload(request.get_json(silent=True) or {})
    human_frame, model_frame = build_feature_row(payload)
    predictions = prediction_payload(model_frame)
    shap_data = shap_payload(model_frame)
    return jsonify(
        {
            "predictions": predictions,
            "shap": shap_data,
            "assumptions": {
                "defaults_source": "Training-set medians for features not shown in the public form.",
                "cohort_scope": "Designed for discharged heart-failure patients only.",
                "warning": "Research prototype only. Not for clinical use or patient-care decisions.",
            },
            "inputs_used": human_frame.iloc[0].to_dict(),
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False)
