# 07 - Conditional External Validation (MIMIC-style)
# Proposal objective 9: run only if an external cohort file is available.

import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

EXTERNAL_FILE = os.path.join("data", "mimic_external.csv")
OUTPUT_FILE = os.path.join("outputs", "external_validation_results.json")

if not os.path.exists(EXTERNAL_FILE):
    print("External validation skipped.")
    print(f"Reason: missing file {EXTERNAL_FILE}")
    print("Place your harmonized external cohort there to run this script.")
    raise SystemExit(0)

required = [
    os.path.join("outputs", "feature_names.csv"),
    os.path.join("outputs", "outcome_map.json"),
]
for p in required:
    if not os.path.exists(p):
        raise FileNotFoundError(f"Missing required preprocessing artifact: {p}")

feature_names = pd.read_csv(os.path.join("outputs", "feature_names.csv"))["feature"].tolist()
with open(os.path.join("outputs", "outcome_map.json"), "r", encoding="utf-8") as f:
    outcome_map = json.load(f)

ext = pd.read_csv(EXTERNAL_FILE)
missing_features = [c for c in feature_names if c not in ext.columns]
if missing_features:
    raise ValueError(
        "External dataset is not harmonized with training features. "
        f"Missing {len(missing_features)} columns, e.g. {missing_features[:10]}"
    )

X_ext = ext[feature_names].copy()
results = []

for label, target_col in outcome_map.items():
    model_path = os.path.join("models", f"best_model_{label}.pkl")
    if not os.path.exists(model_path):
        continue
    if target_col not in ext.columns:
        continue

    y_true = ext[target_col].astype(int).values
    model = joblib.load(model_path)
    y_prob = model.predict_proba(X_ext)[:, 1]

    result = {
        "outcome_label": label,
        "outcome_column": target_col,
        "n_samples": int(len(y_true)),
        "positive_rate": float(np.mean(y_true)),
        "auroc": float(roc_auc_score(y_true, y_prob)),
        "auprc": float(average_precision_score(y_true, y_prob)),
        "brier": float(brier_score_loss(y_true, y_prob)),
    }
    results.append(result)
    print(result)

if not results:
    print("No external validation results produced. Check targets/models availability.")
else:
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"Saved external validation results to {OUTPUT_FILE}")
