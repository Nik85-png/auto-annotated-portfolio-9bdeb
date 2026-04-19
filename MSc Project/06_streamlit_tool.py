import json
import os

import joblib
import numpy as np
import pandas as pd
import streamlit as st

st.set_page_config(page_title="HF-RISK Clinical Tool", layout="wide")

st.title("HF-RISK Clinical Prediction Tool")
st.caption("Proposal objective: clinician-facing prototype with risk outputs and interpretable features.")

required_files = [
    os.path.join("outputs", "feature_names.csv"),
    os.path.join("outputs", "feature_name_map.json"),
    os.path.join("outputs", "outcome_map.json"),
    os.path.join("outputs", "best_models_info.json"),
    os.path.join("outputs", "X_train.csv"),
]

missing = [p for p in required_files if not os.path.exists(p)]
if missing:
    st.error("Missing required files. Run 02_preprocessing.py and 03_modelling.py first.")
    st.code("\n".join(missing))
    st.stop()

feature_names_df = pd.read_csv(os.path.join("outputs", "feature_names.csv"))
if "feature" in feature_names_df.columns:
    feature_names = feature_names_df["feature"].tolist()
else:
    feature_names = feature_names_df.iloc[:, 0].tolist()

with open(os.path.join("outputs", "feature_name_map.json"), "r", encoding="utf-8") as f:
    feature_name_map = json.load(f)

# Models are trained on LightGBM-safe feature names; inputs stay clinician-readable.
model_feature_names = [feature_name_map.get(feat, feat) for feat in feature_names]

with open(os.path.join("outputs", "outcome_map.json"), "r", encoding="utf-8") as f:
    outcome_map = json.load(f)
with open(os.path.join("outputs", "best_models_info.json"), "r", encoding="utf-8") as f:
    best_info = json.load(f)

X_train = pd.read_csv(os.path.join("outputs", "X_train.csv"))
feature_defaults = X_train.median(numeric_only=True).to_dict()

st.warning(
    "Research/testing prototype only. This tool has not been clinically validated "
    "and must not be used to make patient-care decisions."
)

st.subheader("Patient Inputs")
st.write("Provide available values. Leave unknown values as defaults.")

with st.form("risk_form"):
    cols = st.columns(3)
    user_values = {}
    for i, feat in enumerate(feature_names):
        default_val = float(feature_defaults.get(feat, 0.0))
        user_values[feat] = cols[i % 3].number_input(feat, value=default_val, format="%.6f")
    submit = st.form_submit_button("Predict Risk")

if submit:
    x = pd.DataFrame([user_values], columns=feature_names)
    x_model = x.rename(columns=feature_name_map).reindex(columns=model_feature_names)
    st.subheader("Predictions")
    rows = []

    for label, col in outcome_map.items():
        model_path = os.path.join("models", f"best_model_{label}.pkl")
        if os.path.exists(model_path):
            model = joblib.load(model_path)
            prob = float(model.predict_proba(x_model)[:, 1][0])
            rows.append(
                {
                    "outcome_label": label,
                    "outcome_column": col,
                    "predicted_risk": prob,
                    "risk_percent": f"{prob*100:.1f}%",
                    "model": best_info.get(label, {}).get("name", "Unknown"),
                }
            )

    if not rows:
        st.warning("No trained models found in models/. Run 03_modelling.py first.")
    else:
        out_df = pd.DataFrame(rows).sort_values("predicted_risk", ascending=False)
        st.dataframe(out_df[["outcome_label", "model", "risk_percent"]], use_container_width=True)

        st.subheader("Top Drivers (proxy from model feature importances)")
        top_label = out_df.iloc[0]["outcome_label"]
        model_path = os.path.join("models", f"best_model_{top_label}.pkl")
        model = joblib.load(model_path)

        # Handle possible pipeline wrapper.
        base_model = model
        if hasattr(model, "named_steps"):
            base_model = model.named_steps.get("clf", list(model.named_steps.values())[-1])

        if hasattr(base_model, "feature_importances_"):
            imp = pd.Series(base_model.feature_importances_, index=feature_names).sort_values(ascending=False).head(10)
            st.bar_chart(imp[::-1])
        elif hasattr(base_model, "coef_"):
            coef = pd.Series(np.abs(base_model.coef_[0]), index=feature_names).sort_values(ascending=False).head(10)
            st.bar_chart(coef[::-1])
        else:
            st.info("Model does not expose direct importances. Use 05_shap.py for detailed explanations.")

st.markdown("---")
st.write("Run locally:")
st.code("streamlit run 06_streamlit_tool.py")
