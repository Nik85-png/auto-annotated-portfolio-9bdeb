# %% [markdown]
# 08 - External Validation on MIMIC-IV
# HF-RISK | MSc Data Analytics | Nikunj Prajapati (24052351)
#
# Validates trained models on MIMIC-IV heart failure cohort.

# %%
import json
import os
import warnings

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, roc_curve

warnings.filterwarnings("ignore")

plt.rcParams.update(
    {
        "figure.facecolor": "#0d1b2a",
        "axes.facecolor": "#13263b",
        "axes.edgecolor": "#2f4a66",
        "axes.labelcolor": "#c8d7e5",
        "xtick.color": "#8ba4bb",
        "ytick.color": "#8ba4bb",
        "text.color": "#e9f1f8",
        "grid.color": "#1e3a55",
        "grid.linestyle": "--",
        "grid.alpha": 0.6,
        "font.family": "monospace",
        "figure.dpi": 120,
    }
)

OUT = os.path.join("outputs", "external_validation")
os.makedirs(OUT, exist_ok=True)
print("Imports OK")


def norm(text):
    return "".join(ch for ch in str(text).lower() if ch.isalnum())


def bootstrap_auc_ci(y_true, y_prob, n_boot=1000, ci=0.95, seed=42):
    rng = np.random.RandomState(seed)
    aucs = []
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    for _ in range(n_boot):
        idx = rng.choice(len(y_true), len(y_true), replace=True)
        if len(np.unique(y_true[idx])) < 2:
            continue
        aucs.append(roc_auc_score(y_true[idx], y_prob[idx]))
    if not aucs:
        return (np.nan, np.nan)
    alpha = (1 - ci) / 2
    return np.percentile(aucs, [alpha * 100, (1 - alpha) * 100])


# %%
# Load MIMIC cohort.
mimic_candidates = [
    os.path.join("data", "mimic_hf_cohort.csv"),
    "mimic_hf_cohort.csv",
    r"c:\Users\praja\Downloads\mimic_hf_cohort.csv",
]
mimic_path = next((p for p in mimic_candidates if os.path.exists(p)), None)
if mimic_path is None:
    raise FileNotFoundError("mimic_hf_cohort.csv not found in data/, project root, or Downloads.")

mimic = pd.read_csv(mimic_path)
print(f"MIMIC cohort loaded from: {mimic_path}")
print(f"Shape: {mimic.shape}")
if "death_within_6months" in mimic.columns:
    print(f"6-month mortality rate: {mimic['death_within_6months'].mean()*100:.1f}%")
if "death_within_28days" in mimic.columns:
    print(f"28-day mortality rate:  {mimic['death_within_28days'].mean()*100:.1f}%")


# %%
# Load model metadata and expected feature names.
feature_names_df = pd.read_csv(os.path.join("outputs", "feature_names.csv"))
if "feature" in feature_names_df.columns:
    feature_names_orig = feature_names_df["feature"].tolist()
else:
    feature_names_orig = feature_names_df.iloc[:, 0].tolist()

with open(os.path.join("outputs", "feature_name_map.json"), "r", encoding="utf-8") as f:
    feature_name_map = json.load(f)

safe_feature_names = [feature_name_map.get(c, c) for c in feature_names_orig]
with open(os.path.join("outputs", "best_models_info.json"), "r", encoding="utf-8") as f:
    best_info = json.load(f)

print(f"Model expects {len(safe_feature_names)} features")


# %%
# Build MIMIC feature matrix aligned to model feature names.
X_mimic = pd.DataFrame(np.nan, index=mimic.index, columns=safe_feature_names)

# Model feature names are sanitized by 03_modelling.py.
# Map each MIMIC field to one or more expected model targets to improve coverage.
MIMIC_TO_MODEL = {
    "age": ["age_midpoint", "ageCat"],
    "discharge_day": ["dischargeDay"],
    "length_of_stay": ["length_of_hospital_stay"],
    "creatinine": ["creatinine_enzymatic_method", "log_creatinine"],
    "sodium": ["sodium", "sodium_ion"],
    "potassium": ["potassium", "potassium_ion"],
    "hemoglobin": ["hemoglobin", "total_hemoglobin"],
    "hematocrit": ["hematocrit", "hematocrit_blood_gas"],
    "platelets": ["platelet"],
    "wbc": ["leukocyte"],
    "urea_nitrogen": ["urea"],
    "glucose": ["glucose_blood_gas"],
    "magnesium": ["serum_magnesium"],
    "phosphorus": ["Inorganic_Phosphorus"],
    "calcium": ["calcium", "free_calcium"],
    "albumin": ["albumin"],
    "alt": ["glutamic_pyruvic_transaminase"],
    "ast": ["glutamic_oxaloacetic_transaminase"],
    "alkaline_phosphatase": ["alkaline_phosphatase"],
    "neutrophils": ["neutrophil_count", "neutrophil_ratio"],
    "eosinophils": ["eosinophil_count", "eosinophil_ratio"],
    "basophils": ["basophil_count", "basophil_ratio"],
    "lymphocytes": ["lymphocyte_count"],
    "chronic_kidney_disease": ["moderate_to_severe_chronic_kidney_disease", "renal_risk_flag"],
    "liver_disease": ["liver_disease"],
    "diabetes": ["diabetes"],
    "hypertension": ["hypertension"],
    "atrial_fibrillation": ["atrial_fibrillation"],
    "troponin_i": ["high_sensitivity_troponin"],
    "troponin_t": ["high_sensitivity_troponin"],
}

safe_lookup = {norm(c): c for c in safe_feature_names}

def find_matches(target_name):
    key = norm(target_name)
    exact = safe_lookup.get(key)
    if exact is not None:
        return [exact]
    # fallback partial matches
    return [c for c in safe_feature_names if key in norm(c)]


mapped_pairs = 0
for mimic_col, target_names in MIMIC_TO_MODEL.items():
    if mimic_col not in mimic.columns:
        continue
    values = pd.to_numeric(mimic[mimic_col], errors="coerce").values
    for t in target_names:
        matches = find_matches(t)
        for matched in matches:
            X_mimic[matched] = values
            mapped_pairs += 1

# Gender as binary if model has gender feature.
if "gender" in mimic.columns:
    gender_candidates = [c for c in safe_feature_names if "gender" in c.lower()]
    for gc in gender_candidates:
        X_mimic[gc] = (mimic["gender"].astype(str).str.upper() == "M").astype(float).values
        mapped_pairs += 1

# Additional auto-alias pass by normalized names from MIMIC columns.
for mc in mimic.columns:
    mc_norm = norm(mc)
    if mc_norm in safe_lookup:
        X_mimic[safe_lookup[mc_norm]] = pd.to_numeric(mimic[mc], errors="coerce").values
        mapped_pairs += 1

print(f"Mapped/derived model-feature assignments: {mapped_pairs}")


# %%
# Impute missing values for cross-dataset prediction.
missing = X_mimic.isna().sum()
print(f"Features with any missing: {(missing > 0).sum()}")
print(f"Features with 100% missing: {(missing == len(X_mimic)).sum()}")

for col in X_mimic.columns:
    if X_mimic[col].isna().all():
        X_mimic[col] = 0.0
    elif X_mimic[col].isna().any():
        X_mimic[col] = X_mimic[col].fillna(X_mimic[col].median())

print(f"Missing after imputation: {int(X_mimic.isna().sum().sum())}")


# %%
# External validation.
OUTCOMES = {
    "28d_death": ("death_within_28days", "28-day Mortality"),
    "6m_death": ("death_within_6months", "6-month Mortality"),
}

results = {}
roc_data = {}

for outcome_label, (mimic_col, display_name) in OUTCOMES.items():
    model_path = os.path.join("models", f"best_model_{outcome_label}.pkl")
    if not os.path.exists(model_path):
        print(f"Model missing: {model_path}")
        continue
    if mimic_col not in mimic.columns:
        print(f"MIMIC outcome missing: {mimic_col}")
        continue

    y_true = mimic[mimic_col].astype(int).values
    if len(np.unique(y_true)) < 2:
        print(f"Outcome {display_name} has one class only in MIMIC. Skipping.")
        continue

    model = joblib.load(model_path)
    y_prob = model.predict_proba(X_mimic[safe_feature_names])[:, 1]
    auc = roc_auc_score(y_true, y_prob)
    ci_low, ci_high = bootstrap_auc_ci(y_true, y_prob)

    print(f"{display_name}: AUROC={auc:.3f} (95% CI {ci_low:.3f}-{ci_high:.3f})")

    results[outcome_label] = {
        "display_name": display_name,
        "n": int(len(y_true)),
        "positive_cases": int(y_true.sum()),
        "positive_rate": float(y_true.mean() * 100),
        "external_auc": float(auc),
        "ci_low": float(ci_low),
        "ci_high": float(ci_high),
        "internal_auc": best_info.get(outcome_label, {}).get("test_auc", None),
    }
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    roc_data[outcome_label] = (fpr, tpr, auc, display_name)


# %%
# Save table + plot.
if results:
    results_df = pd.DataFrame(results).T
    results_df.to_csv(os.path.join(OUT, "external_validation_results.csv"), index=False)
    with open(os.path.join(OUT, "external_validation_results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("Saved external_validation_results.csv/json")

if roc_data:
    fig, axes = plt.subplots(1, len(roc_data), figsize=(6 * len(roc_data), 5))
    if len(roc_data) == 1:
        axes = [axes]

    for ax, (_, (fpr, tpr, auc, display_name)) in zip(axes, roc_data.items()):
        ax.plot(fpr, tpr, color="#f4a261", linewidth=2, label=f"External AUROC={auc:.3f}")
        ax.plot([0, 1], [0, 1], color="#2f4a66", linestyle="--", linewidth=1, label="Random (0.5)")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1.02)
        ax.set_xlabel("False Positive Rate")
        ax.set_ylabel("True Positive Rate")
        ax.set_title(f"{display_name} - External Validation", fontsize=11, fontweight="bold")
        ax.legend(fontsize=8, loc="lower right")
        ax.grid(True)

    plt.suptitle("External Validation on MIMIC-IV", fontsize=12, fontweight="bold", y=1.02)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "external_validation_roc.png"), bbox_inches="tight")
    plt.close()
    print("Saved external_validation_roc.png")

print("External validation complete.")
