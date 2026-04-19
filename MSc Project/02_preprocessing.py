# %% [markdown]
# 02 - Data Preprocessing and Feature Engineering
# HF-RISK | MSc Data Analytics | Nikunj Prajapati (24052351)
#
# Proposal-aligned workflow:
# 1) Resolve outcomes
# 2) Drop unusable columns (>80% missing and 100% missing)
# 3) Encode categoricals
# 4) Feature engineering (log BNP, risk flags, age extraction)
# 5) Three-tier missing strategy:
#    - <10% missing: median imputation
#    - 10-80% missing: MICE imputation
#    - >80% missing: dropped
# 6) Train/test split and SMOTE check
# 7) Save all artifacts for downstream scripts

# %%
import json
import os
import warnings

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.experimental import enable_iterative_imputer  # noqa: F401
from sklearn.impute import IterativeImputer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

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

OUT = os.path.join("outputs", "preprocessing")
os.makedirs(OUT, exist_ok=True)
os.makedirs("models", exist_ok=True)

print("Imports OK")


# %%
def find_outcome_col(columns, keywords):
    for col in columns:
        low = col.lower().replace("_", ".").replace(" ", ".")
        if all(k in low for k in keywords):
            return col
    return None


def parse_age_band_to_midpoint(value):
    if pd.isna(value):
        return np.nan
    text = str(value).strip()
    digits = [int(x) for x in "".join(ch if ch.isdigit() else " " for ch in text).split()]
    if len(digits) >= 2:
        return float((digits[0] + digits[1]) / 2.0)
    if len(digits) == 1:
        return float(digits[0])
    return np.nan


# %%
df_raw = pd.read_csv(os.path.join("data", "dat.csv"))
print(f"Raw shape: {df_raw.shape[0]:,} x {df_raw.shape[1]}")

# Remove index-like artifact column if present.
if "Unnamed: 0" in df_raw.columns:
    df_raw = df_raw.drop(columns=["Unnamed: 0"])
    print("Dropped artifact column: Unnamed: 0")

OUTCOME_MAP = {
    "28d_death": find_outcome_col(df_raw.columns, ["death", "28"]),
    "3m_death": find_outcome_col(df_raw.columns, ["death", "3"]),
    "6m_death": find_outcome_col(df_raw.columns, ["death", "6"]),
    "6m_readmission": find_outcome_col(df_raw.columns, ["admi", "6"]),
}
outcome_cols = [v for v in OUTCOME_MAP.values() if v is not None]

print("\nOutcome columns")
for k, v in OUTCOME_MAP.items():
    if v is None:
        print(f"  {k:18s} -> NOT FOUND")
    else:
        pos_rate = (df_raw[v] == 1).mean() * 100
        print(f"  {k:18s} -> {v} (positive {pos_rate:.2f}%)")


# %%
# Step 1: proposal three-tier rule starts with dropping >80% missing.
miss_pct = df_raw.isna().mean()
drop_cols = [c for c in df_raw.columns if miss_pct[c] > 0.80 and c not in outcome_cols]

print(f"\nDropping {len(drop_cols)} columns with >80% missing")
df = df_raw.drop(columns=drop_cols).copy()

# Remove near-zero-variance numeric columns.
numeric_cols = df.select_dtypes(include="number").columns
nzv_cols = [c for c in numeric_cols if df[c].nunique(dropna=True) <= 1 and c not in outcome_cols]
if nzv_cols:
    print(f"Dropping {len(nzv_cols)} near-zero-variance columns")
    df = df.drop(columns=nzv_cols)

print(f"Shape after drops: {df.shape}")


# %%
# Step 2: encode categoricals (keep low-cardinality columns, drop high-cardinality free text).
obj_cols = [c for c in df.select_dtypes(include="object").columns if c not in outcome_cols]
le = LabelEncoder()
encoded_cols = []
dropped_obj_cols = []

for col in obj_cols:
    uniq = df[col].nunique(dropna=True)
    if uniq <= 30:
        df[col] = le.fit_transform(df[col].astype(str).fillna("missing"))
        encoded_cols.append(col)
    else:
        dropped_obj_cols.append(col)

if dropped_obj_cols:
    df = df.drop(columns=dropped_obj_cols)

print(f"Encoded object columns: {len(encoded_cols)}")
print(f"Dropped high-cardinality object columns: {len(dropped_obj_cols)}")


# %%
# Step 3: feature engineering required by proposal.
bnp_col = next((c for c in df.columns if "bnp" in c.lower()), None)
if bnp_col:
    df["log_bnp"] = np.log1p(df[bnp_col].clip(lower=0))
    df["high_bnp_flag"] = (df[bnp_col] > 400).astype(float)
    df.loc[df[bnp_col].isna(), "high_bnp_flag"] = np.nan

creat_col = next((c for c in df.columns if "creat" in c.lower()), None)
if creat_col:
    df["log_creatinine"] = np.log1p(df[creat_col].clip(lower=0))

egfr_col = next((c for c in df.columns if "egfr" in c.lower() or ".gfr" in c.lower()), None)
if egfr_col:
    df["renal_risk_flag"] = (df[egfr_col] < 60).astype(float)
    df.loc[df[egfr_col].isna(), "renal_risk_flag"] = np.nan

lvef_col = next((c for c in df.columns if "lvef" in c.lower() or "ejection" in c.lower()), None)
if lvef_col:
    df["reduced_ef_flag"] = (df[lvef_col] < 40).astype(float)
    df.loc[df[lvef_col].isna(), "reduced_ef_flag"] = np.nan

age_col = next((c for c in df_raw.columns if "age" in c.lower()), None)
if age_col and age_col in df.columns and not pd.api.types.is_numeric_dtype(df[age_col]):
    df["age_midpoint"] = df_raw[age_col].apply(parse_age_band_to_midpoint)

print(f"Shape after feature engineering: {df.shape}")

# Remove leakage columns - these contain post-discharge outcome information
LEAKAGE_COLS = [
    "inpatient.number",
    "dischargeDay",
    "outcome.during.hospitalization",
    "re.admission.within.28.days",
    "re.admission.within.3.months",
    "re.admission.time..days.from.admission.",
    "return.to.emergency.department.within.6.months",
    "time.to.emergency.department.within.6.months",
]

leakage_found = [c for c in LEAKAGE_COLS if c in df.columns]
print(f"Removing {len(leakage_found)} leakage columns: {leakage_found}")
df = df.drop(columns=leakage_found, errors="ignore")


# %%
# Step 4: apply three-tier imputation strategy exactly.
feature_cols = [c for c in df.columns if c not in outcome_cols]
X = df[feature_cols].copy()

missing_frac = X.isna().mean()
low_missing_cols = [c for c in X.columns if 0 < missing_frac[c] < 0.10]
moderate_missing_cols = [c for c in X.columns if 0.10 <= missing_frac[c] <= 0.80]

print("\nThree-tier imputation strategy")
print(f"  <10% missing   (median): {len(low_missing_cols)} columns")
print(f"  10-80% missing (MICE)  : {len(moderate_missing_cols)} columns")
print(f"  >80% missing dropped   : already dropped")

if low_missing_cols:
    medians = X[low_missing_cols].median(numeric_only=True)
    X[low_missing_cols] = X[low_missing_cols].fillna(medians)

mice_cols = [c for c in X.columns if X[c].isna().any()]
mice_imputer = None

if mice_cols:
    print(f"Running MICE on {len(mice_cols)} columns ...")
    mice_imputer = IterativeImputer(
        max_iter=10,
        random_state=42,
        initial_strategy="median",
        min_value=0,
        verbose=1,
    )
    X[mice_cols] = mice_imputer.fit_transform(X[mice_cols])
else:
    print("No columns required MICE after low-missing median fill.")

print(f"Remaining missing cells: {int(X.isna().sum().sum())}")


# %%
if mice_imputer is not None:
    joblib.dump(mice_imputer, os.path.join("models", "mice_imputer.pkl"))
    print("Saved models/mice_imputer.pkl")

# Save full preprocessing metadata used by Streamlit/external validation.
preprocessing_meta = {
    "outcome_map": OUTCOME_MAP,
    "dropped_missing_gt80": drop_cols,
    "dropped_nzv": nzv_cols,
    "dropped_high_cardinality_obj": dropped_obj_cols,
    "encoded_object_cols": encoded_cols,
    "feature_cols_after_preprocessing": X.columns.tolist(),
    "low_missing_median_cols": low_missing_cols,
    "mice_cols": mice_cols,
}

with open(os.path.join("outputs", "preprocessing_meta.json"), "w", encoding="utf-8") as f:
    json.dump(preprocessing_meta, f, indent=2)


# %%
y_all = df[outcome_cols].copy()
primary_target = OUTCOME_MAP.get("6m_death") or outcome_cols[0]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y_all,
    test_size=0.2,
    random_state=42,
    stratify=y_all[primary_target] if primary_target in y_all.columns else None,
)

print(f"\nTrain set: {X_train.shape[0]:,}")
print(f"Test set : {X_test.shape[0]:,}")
print(f"Primary outcome for stratification: {primary_target}")
print(f"Train positive rate: {y_train[primary_target].mean()*100:.2f}%")
print(f"Test positive rate : {y_test[primary_target].mean()*100:.2f}%")


# %%
# Proposal alignment: demonstrate SMOTE + class weighting strategy.
y_primary = y_train[primary_target]
if y_primary.mean() < 0.10:
    smote = SMOTE(random_state=42, k_neighbors=min(5, max(1, int(y_primary.sum()) - 1)))
    _, y_sm = smote.fit_resample(X_train, y_primary)
    print("\nSMOTE demonstration (primary target)")
    print(f"Before: {y_primary.value_counts().to_dict()}")
    print(f"After : {pd.Series(y_sm).value_counts().to_dict()}")
else:
    print("\nPrimary target is not severely imbalanced; SMOTE demonstration skipped.")


# %%
X_train.to_csv(os.path.join("outputs", "X_train.csv"), index=False)
X_test.to_csv(os.path.join("outputs", "X_test.csv"), index=False)
y_train.to_csv(os.path.join("outputs", "y_train.csv"), index=False)
y_test.to_csv(os.path.join("outputs", "y_test.csv"), index=False)
X.to_csv(os.path.join("outputs", "X_imputed_full.csv"), index=False)
pd.Series(X.columns, name="feature").to_csv(os.path.join("outputs", "feature_names.csv"), index=False)

with open(os.path.join("outputs", "outcome_map.json"), "w", encoding="utf-8") as f:
    json.dump(OUTCOME_MAP, f, indent=2)

print("\nPreprocessing complete.")
print("Saved outputs: X_train/X_test/y_train/y_test/X_imputed_full/feature_names/outcome_map/preprocessing_meta")
print("Next step: run 03_modelling.py")
