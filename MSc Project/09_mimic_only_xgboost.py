import os
import warnings

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

OUT_DIR = os.path.join("outputs", "mimic_only")
os.makedirs(OUT_DIR, exist_ok=True)

mimic_candidates = [
    os.path.join("data", "mimic_hf_cohort.csv"),
    "mimic_hf_cohort.csv",
    r"c:\Users\praja\Downloads\mimic_hf_cohort.csv",
]
mimic_path = next((p for p in mimic_candidates if os.path.exists(p)), None)
if mimic_path is None:
    raise FileNotFoundError("mimic_hf_cohort.csv not found in data/, project root, or Downloads.")

mimic_hf = pd.read_csv(mimic_path)
print(f"Cohort: {mimic_hf.shape}")
print(f"6-month mortality: {mimic_hf['death_within_6months'].mean()*100:.1f}%")

FEATURES = [
    "age",
    "length_of_stay",
    "discharge_day",
    "creatinine",
    "potassium",
    "sodium",
    "hematocrit",
    "hemoglobin",
    "platelets",
    "wbc",
    "magnesium",
    "phosphorus",
    "urea_nitrogen",
    "glucose",
    "calcium",
    "albumin",
    "alt",
    "ast",
    "alkaline_phosphatase",
    "chronic_kidney_disease",
    "liver_disease",
    "diabetes",
    "hypertension",
    "atrial_fibrillation",
]

TARGETS = {
    "6m_death": "death_within_6months",
    "28d_death": "death_within_28days",
}

X = mimic_hf[FEATURES].copy()
imputer = SimpleImputer(strategy="median")
X_imputed = pd.DataFrame(imputer.fit_transform(X), columns=FEATURES, index=mimic_hf.index)

print(f"Feature matrix: {X_imputed.shape}")
print(f"Missing after imputation: {X_imputed.isnull().sum().sum()}")

results = {}

for target_name, target_col in TARGETS.items():
    y = mimic_hf[target_col].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X_imputed,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    print(f"\nTraining MIMIC XGBoost - {target_name}")
    print(f"Train: {X_train.shape} | Test: {X_test.shape}")
    print(f"Test positives: {int(y_test.sum())} ({y_test.mean()*100:.1f}%)")

    scale_pos = (y_train == 0).sum() / max(1, (y_train == 1).sum())

    model = XGBClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos,
        random_state=42,
        eval_metric="logloss",
        verbosity=0,
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv, scoring="roc_auc")
    print(f"  CV AUROC: {cv_scores.mean():.3f} (+/-{cv_scores.std():.3f})")

    model.fit(X_train, y_train)
    y_prob = model.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, y_prob)
    print(f"  Test AUROC: {test_auc:.3f}")

    results[target_name] = {
        "target_col": target_col,
        "cv_auc": float(np.round(cv_scores.mean(), 3)),
        "cv_std": float(np.round(cv_scores.std(), 3)),
        "test_auc": float(np.round(test_auc, 3)),
        "n_test": int(len(y_test)),
        "n_positive": int(y_test.sum()),
    }

results_df = pd.DataFrame(results).T
results_df.to_csv(os.path.join(OUT_DIR, "mimic_only_xgboost_results.csv"), index=True)

print("\n=== MIMIC-ONLY MODEL RESULTS ===")
for name, res in results.items():
    print(f"{name}: CV={res['cv_auc']}(+/-{res['cv_std']}) | Test={res['test_auc']}")
print(f"\nSaved: {os.path.join(OUT_DIR, 'mimic_only_xgboost_results.csv')}")
