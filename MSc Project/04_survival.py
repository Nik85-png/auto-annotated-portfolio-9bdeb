# %% [markdown]
# 04 - Survival Analysis
# HF-RISK | MSc Data Analytics | Nikunj Prajapati (24052351)
#
# Proposal-aligned survival workflow:
# 1) Build explicit time-to-event for 6m death:
#    - Event=1: use time.of.death..days.from.admission.
#    - Event=0: censor at re.admission time if available, else 180 days.
# 2) Kaplan-Meier curves
# 3) Cox PH model
# 4) Random Survival Forest

# %%
import json
import os
import warnings

import joblib
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

try:
    from lifelines import CoxPHFitter, KaplanMeierFitter
    from lifelines.statistics import logrank_test

    LIFELINES_OK = True
except ImportError:
    print("lifelines not installed. Run: pip install lifelines")
    LIFELINES_OK = False

try:
    from sksurv.ensemble import RandomSurvivalForest
    from sksurv.metrics import concordance_index_censored
    from sksurv.util import Surv

    SKSURV_OK = True
except ImportError:
    print("scikit-survival not installed. Run: pip install scikit-survival")
    SKSURV_OK = False

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

PALETTE = ["#2a9d8f", "#f4a261", "#e76f51", "#e9c46a", "#98e2d7"]
OUT = os.path.join("outputs", "survival")
os.makedirs(OUT, exist_ok=True)


# %%
X_full = pd.read_csv(os.path.join("outputs", "X_imputed_full.csv"))
df_raw = pd.read_csv(os.path.join("data", "dat.csv"))
with open(os.path.join("outputs", "outcome_map.json"), "r", encoding="utf-8") as f:
    OUTCOME_MAP = json.load(f)

event_col = OUTCOME_MAP.get("6m_death")
death_time_col = "time.of.death..days.from.admission."
readm_time_col = "re.admission.time..days.from.admission."

print(f"Imputed feature matrix shape: {X_full.shape}")
print(f"Event column: {event_col}")
print(f"Death-time column present: {death_time_col in df_raw.columns}")
print(f"Readmission-time column present: {readm_time_col in df_raw.columns}")

if event_col is None or event_col not in df_raw.columns:
    raise ValueError("6m death outcome column not found. Re-run 02_preprocessing.py first.")

if death_time_col not in df_raw.columns:
    raise ValueError(f"Expected column missing: {death_time_col}")


# %%
# Build proposal-aligned time-to-event.
event = df_raw[event_col].astype(int)

# For death events, use death time if present.
time_to_event = df_raw[death_time_col].copy()

# For censored cases, use readmission time when available, else administrative censoring at 180 days.
if readm_time_col in df_raw.columns:
    censor_time = df_raw[readm_time_col].copy()
else:
    censor_time = pd.Series(np.nan, index=df_raw.index)

time_to_event = np.where(event == 1, time_to_event, censor_time)
time_to_event = pd.Series(time_to_event, index=df_raw.index).fillna(180.0).clip(lower=0.1, upper=180.0)

surv_df = pd.concat(
    [
        X_full.reset_index(drop=True),
        pd.DataFrame(
            {
                "event_6m_death": event.values,
                "time_to_event_days": time_to_event.values,
            }
        ),
    ],
    axis=1,
)

print(f"Survival dataset: {surv_df.shape[0]:,} rows")
print(f"Events: {surv_df['event_6m_death'].sum():,} ({surv_df['event_6m_death'].mean()*100:.2f}%)")
print(
    "Time-to-event summary (days):",
    {
        "min": float(surv_df["time_to_event_days"].min()),
        "median": float(surv_df["time_to_event_days"].median()),
        "max": float(surv_df["time_to_event_days"].max()),
    },
)

# Exclude identifiers, targets, and censoring-construction fields from survival predictors.
EXCLUDE_FROM_SURVIVAL = [
    "Unnamed: 0",
    "event_6m_death",
    "time_to_event_days",
    "re.admission.time..days.from.admission.",
    "time.to.emergency.department.within.6.months",
]


# %%
if LIFELINES_OK:
    nyha_col = next((c for c in df_raw.columns if "nyha" in c.lower()), None)
    if nyha_col:
        km_df = pd.DataFrame(
            {
                "time": surv_df["time_to_event_days"],
                "event": surv_df["event_6m_death"],
                "nyha": df_raw[nyha_col],
            }
        ).dropna()

        fig, ax = plt.subplots(figsize=(10, 6))
        groups = sorted(km_df["nyha"].unique())
        for g, color in zip(groups, PALETTE):
            mask = km_df["nyha"] == g
            kmf = KaplanMeierFitter()
            kmf.fit(km_df.loc[mask, "time"], km_df.loc[mask, "event"], label=f"NYHA {g} (n={mask.sum():,})")
            kmf.plot_survival_function(ax=ax, ci_show=True, color=color, linewidth=2)

        if len(groups) >= 2:
            g1 = km_df[km_df["nyha"] == groups[0]]
            g2 = km_df[km_df["nyha"] == groups[-1]]
            lr = logrank_test(g1["time"], g2["time"], event_observed_A=g1["event"], event_observed_B=g2["event"])
            ax.text(
                0.62,
                0.92,
                f"Log-rank p={lr.p_value:.4f}",
                transform=ax.transAxes,
                fontsize=9,
                bbox=dict(facecolor="#152843", edgecolor="#2f4a66", alpha=0.8),
            )

        ax.set_title("Kaplan-Meier Survival Curves by NYHA Class", fontsize=12, fontweight="bold")
        ax.set_xlabel("Days from discharge")
        ax.set_ylabel("Survival probability")
        ax.set_ylim(0, 1.05)
        ax.grid(True)
        ax.legend(fontsize=9)
        plt.tight_layout()
        plt.savefig(os.path.join(OUT, "km_by_nyha.png"), bbox_inches="tight")
        plt.close()
        print("Saved km_by_nyha.png")


# %%
if LIFELINES_OK:
    feature_cols = [
        c
        for c in surv_df.columns
        if c not in EXCLUDE_FROM_SURVIVAL and pd.api.types.is_numeric_dtype(surv_df[c])
    ]
    top_feat = surv_df[feature_cols].var().sort_values(ascending=False).head(20).index.tolist()
    cox_df = surv_df[top_feat + ["time_to_event_days", "event_6m_death"]].copy()

    scaler = StandardScaler()
    cox_df[top_feat] = scaler.fit_transform(cox_df[top_feat])

    cph = CoxPHFitter(penalizer=0.1)
    cph.fit(cox_df, duration_col="time_to_event_days", event_col="event_6m_death")
    c_index = cph.concordance_index_
    print(f"Cox C-index: {c_index:.3f}")

    summary = cph.summary.sort_values("coef")
    fig, ax = plt.subplots(figsize=(10, max(6, len(summary) * 0.35)))
    colors = ["#e76f51" if c > 0 else "#2a9d8f" for c in summary["coef"]]
    ax.barh(summary.index, summary["coef"], color=colors, alpha=0.85, height=0.6)
    ax.errorbar(
        summary["coef"],
        summary.index,
        xerr=1.96 * summary["se(coef)"],
        fmt="none",
        color="#8ba4bb",
        capsize=3,
        linewidth=1,
    )
    ax.axvline(0, color="#e9f1f8", linewidth=1.2)
    ax.set_xlabel("Log hazard coefficient (+ increases risk, - decreases risk)")
    ax.set_title(f"Cox PH coefficients (C-index={c_index:.3f})", fontsize=12, fontweight="bold")
    ax.legend(
        handles=[
            mpatches.Patch(color="#e76f51", label="Higher risk"),
            mpatches.Patch(color="#2a9d8f", label="Lower risk"),
        ],
        fontsize=9,
    )
    ax.grid(axis="x")
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "cox_forest_plot.png"), bbox_inches="tight")
    plt.close()
    print("Saved cox_forest_plot.png")

    joblib.dump(cph, os.path.join("models", "cox_model.pkl"))
    print("Saved models/cox_model.pkl")


# %%
if SKSURV_OK:
    feature_cols = [
        c
        for c in surv_df.columns
        if c not in EXCLUDE_FROM_SURVIVAL and pd.api.types.is_numeric_dtype(surv_df[c])
    ]
    X_s = surv_df[feature_cols].values
    y_s = Surv.from_arrays(
        event=surv_df["event_6m_death"].astype(bool).values,
        time=surv_df["time_to_event_days"].values,
    )

    idx = np.random.RandomState(42).permutation(len(X_s))
    split = int(0.8 * len(X_s))
    X_tr, X_te = X_s[idx[:split]], X_s[idx[split:]]
    y_tr, y_te = y_s[idx[:split]], y_s[idx[split:]]

    rsf = RandomSurvivalForest(
        n_estimators=200,
        min_samples_split=10,
        min_samples_leaf=5,
        max_features="sqrt",
        n_jobs=1,
        random_state=42,
    )
    rsf.fit(X_tr, y_tr)
    risk_scores = rsf.predict(X_te)
    ci = concordance_index_censored(y_te["event"], y_te["time"], risk_scores)[0]
    print(f"RSF C-index: {ci:.3f}")

    try:
        importances = pd.Series(rsf.feature_importances_, index=feature_cols).sort_values(ascending=False).head(20)
        fig, ax = plt.subplots(figsize=(10, 7))
        ax.barh(importances.index[::-1], importances.values[::-1], color="#2a9d8f", alpha=0.85)
        ax.set_xlabel("Permutation feature importance")
        ax.set_title(f"RSF top 20 features (C-index={ci:.3f})", fontsize=12, fontweight="bold")
        ax.grid(axis="x")
        plt.tight_layout()
        plt.savefig(os.path.join(OUT, "rsf_feature_importance.png"), bbox_inches="tight")
        plt.close()
        print("Saved rsf_feature_importance.png")
    except NotImplementedError:
        print("RSF feature_importances_ not implemented in this version; skipping importance plot.")

    joblib.dump(rsf, os.path.join("models", "rsf_model.pkl"))
    print("Saved models/rsf_model.pkl")


# %%
print("Survival analysis complete. Outputs saved to outputs/survival/")
