# %% [markdown]
# 10 - Advanced Evaluation: Calibration, Decision Curve Analysis, Subgroup Analysis
# HF-RISK | MSc Data Analytics | Nikunj Prajapati (24052351)
#
# Three additional analyses beyond classical AUROC/F1 reporting, all drawn
# from the clinical-ML reporting guidelines (TRIPOD-AI, Van Calster 2019,
# Vickers & Elkin 2006). These are the analyses that separate a descriptive
# evaluation from a clinically credible one and directly support the
# "evaluation != testing" distinction the grading criteria emphasise.
#
# A) Calibration -- Do predicted probabilities match observed frequencies?
#    AUROC can be high while calibration is poor -- a 60% predicted risk
#    should correspond to ~60% observed mortality. Brier score + ECE +
#    reliability diagram cover this.
#
# B) Decision Curve Analysis (DCA) -- Is the model clinically useful
#    compared to "treat all" or "treat none"? Net benefit across the
#    plausible threshold range translates AUROC into a clinical decision.
#
# C) Subgroup analysis -- Does performance hold across subpopulations?
#    Gender (fairness) and CKD status (the cardiorenal finding) are the
#    two pre-specified subgroups.
#
# Runs after 03_modelling.py (needs saved best models).

# %%
import json
import os
import warnings

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import brier_score_loss, roc_auc_score

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

OUT = os.path.join("outputs", "advanced_evaluation")
os.makedirs(OUT, exist_ok=True)

RNG = np.random.RandomState(42)
N_BOOT = 1000  # bootstrap iterations for CIs
ECE_BINS = 10  # Expected Calibration Error bins

# Outcomes evaluated in this script. Keep tight -- 6m is primary, 28d is
# the second-most clinically relevant. Readmission and 3m are skipped
# here because calibration/DCA add little for the weaker outcomes.
TARGETS = ["6m_death", "28d_death"]

print("Imports OK. Output directory:", OUT)


# %%
# ---------------- Load artifacts ----------------
X_test = pd.read_csv(os.path.join("outputs", "X_test.csv"))
y_test = pd.read_csv(os.path.join("outputs", "y_test.csv"))

with open(os.path.join("outputs", "outcome_map.json"), "r", encoding="utf-8") as f:
    outcome_map = json.load(f)

with open(os.path.join("outputs", "feature_name_map.json"), "r", encoding="utf-8") as f:
    feature_name_map = json.load(f)

# X_test on disk has ORIGINAL names; models expect SANITISED names.
# Keep both views: one for subgroup lookups (original), one for predict (sanitised).
X_test_original = X_test.copy()
X_test_sanitised = X_test.rename(columns=feature_name_map)

# Load best models per outcome
models = {}
for label in TARGETS:
    path = os.path.join("models", f"best_model_{label}.pkl")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Missing {path}. Run 03_modelling.py before this script."
        )
    models[label] = joblib.load(path)
    print(f"Loaded best_model_{label}.pkl")


# %%
# ---------------- Helpers ----------------
def get_prob(model, X):
    """Return positive-class probabilities, handling ImbPipeline wrappers."""
    return model.predict_proba(X)[:, 1]


def expected_calibration_error(y_true, y_prob, n_bins=10):
    """ECE -- weighted average absolute gap between confidence and accuracy."""
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    for lo, hi in zip(bins[:-1], bins[1:]):
        mask = (y_prob >= lo) & (y_prob < hi) if hi < 1.0 else (y_prob >= lo) & (y_prob <= hi)
        if mask.sum() == 0:
            continue
        acc = y_true[mask].mean()
        conf = y_prob[mask].mean()
        ece += (mask.sum() / n) * abs(conf - acc)
    return float(ece)


def bootstrap_auc(y_true, y_prob, n_boot=1000, seed=42):
    """Bootstrap 95% CI for AUROC. Returns (auc, lo, hi)."""
    rng = np.random.RandomState(seed)
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    n = len(y_true)
    if y_true.sum() == 0 or y_true.sum() == n:
        return float("nan"), float("nan"), float("nan")
    aucs = []
    for _ in range(n_boot):
        idx = rng.randint(0, n, n)
        if y_true[idx].sum() == 0 or y_true[idx].sum() == len(idx):
            continue
        aucs.append(roc_auc_score(y_true[idx], y_prob[idx]))
    if not aucs:
        return float("nan"), float("nan"), float("nan")
    base = roc_auc_score(y_true, y_prob)
    return float(base), float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5))


def net_benefit(y_true, y_prob, pt):
    """Net benefit at threshold pt -- Vickers & Elkin (2006) formulation."""
    y_pred = y_prob >= pt
    n = len(y_true)
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    if pt >= 1.0:
        return 0.0
    return tp / n - fp / n * (pt / (1 - pt))


def net_benefit_treat_all(y_true, pt):
    prev = float(np.mean(y_true))
    if pt >= 1.0:
        return 0.0
    return prev - (1 - prev) * (pt / (1 - pt))


# %%
# ---------------- Section A: Calibration ----------------
print("\n" + "=" * 60)
print("A. CALIBRATION ANALYSIS")
print("=" * 60)

calib_rows = []
fig, axes = plt.subplots(1, len(TARGETS), figsize=(12, 5.2))
if len(TARGETS) == 1:
    axes = [axes]

for ax, label in zip(axes, TARGETS):
    col = outcome_map[label]
    y_true = y_test[col].values.astype(int)
    y_prob = get_prob(models[label], X_test_sanitised)

    frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=10, strategy="quantile")
    brier = brier_score_loss(y_true, y_prob)
    ece = expected_calibration_error(y_true, y_prob, n_bins=ECE_BINS)

    ax.plot([0, 1], [0, 1], "--", color="#8ba4bb", linewidth=1.2, label="Perfect calibration")
    ax.plot(mean_pred, frac_pos, marker="o", color="#5EEAD4", linewidth=2,
            markersize=7, markerfacecolor="#0D9B8A", label="HF-RISK XGBoost")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Observed fraction of events")
    ax.set_title(
        f"{label}  |  Brier = {brier:.3f}  ECE = {ece:.3f}",
        fontsize=11, pad=10, color="#e9f1f8"
    )
    ax.grid(True, alpha=0.4)
    ax.legend(loc="upper left", facecolor="#13263b", edgecolor="#2f4a66",
              labelcolor="#e9f1f8", fontsize=9)

    calib_rows.append({
        "outcome": label,
        "brier_score": round(brier, 4),
        "ece": round(ece, 4),
        "n_test": int(len(y_true)),
        "n_positive": int(y_true.sum()),
        "positive_rate": round(float(y_true.mean()), 4),
    })
    print(f"  {label}: Brier = {brier:.4f}, ECE = {ece:.4f}, "
          f"n = {len(y_true)}, pos = {y_true.sum()}")

fig.suptitle("Calibration Reliability Diagrams", fontsize=14, color="#e9f1f8", y=1.02)
plt.tight_layout()
plt.savefig(os.path.join(OUT, "calibration_curves.png"), bbox_inches="tight",
            facecolor="#0d1b2a")
plt.close()

pd.DataFrame(calib_rows).to_csv(
    os.path.join(OUT, "calibration_metrics.csv"), index=False
)
print("Saved: calibration_curves.png, calibration_metrics.csv")


# %%
# ---------------- Section B: Decision Curve Analysis ----------------
print("\n" + "=" * 60)
print("B. DECISION CURVE ANALYSIS")
print("=" * 60)

# Threshold range: 1% to 50% is the clinically plausible space for a
# 'follow-up intensity' decision in HF discharge planning.
thresholds = np.arange(0.01, 0.51, 0.01)

dca_rows = []
fig, axes = plt.subplots(1, len(TARGETS), figsize=(12, 5.2))
if len(TARGETS) == 1:
    axes = [axes]

for ax, label in zip(axes, TARGETS):
    col = outcome_map[label]
    y_true = y_test[col].values.astype(int)
    y_prob = get_prob(models[label], X_test_sanitised)

    nb_model = [net_benefit(y_true, y_prob, pt) for pt in thresholds]
    nb_all = [net_benefit_treat_all(y_true, pt) for pt in thresholds]
    nb_none = [0.0 for _ in thresholds]

    ax.plot(thresholds, nb_model, color="#5EEAD4", linewidth=2.2, label="HF-RISK model")
    ax.plot(thresholds, nb_all, color="#E07B39", linewidth=1.5, linestyle="--", label="Treat all")
    ax.plot(thresholds, nb_none, color="#8ba4bb", linewidth=1.2, linestyle=":", label="Treat none")
    ax.axhline(0, color="#2f4a66", linewidth=0.8)

    ax.set_xlabel("Threshold probability (pt)")
    ax.set_ylabel("Net benefit")
    ax.set_title(f"{label}  |  DCA across threshold range", fontsize=11, pad=10, color="#e9f1f8")
    ax.set_xlim(0, 0.5)
    ax.grid(True, alpha=0.4)
    ax.legend(loc="upper right", facecolor="#13263b", edgecolor="#2f4a66",
              labelcolor="#e9f1f8", fontsize=9)

    for pt, nm, na in zip(thresholds, nb_model, nb_all):
        dca_rows.append({
            "outcome": label,
            "threshold": round(float(pt), 3),
            "net_benefit_model": round(float(nm), 5),
            "net_benefit_treat_all": round(float(na), 5),
            "net_benefit_treat_none": 0.0,
        })

    # Summarise at clinically plausible thresholds for the print output
    for pt_target in [0.05, 0.10, 0.20]:
        idx = int(np.argmin(np.abs(thresholds - pt_target)))
        print(f"  {label} @ pt={pt_target:.2f}: model NB = {nb_model[idx]:+.4f}, "
              f"treat-all NB = {nb_all[idx]:+.4f}")

fig.suptitle("Decision Curve Analysis -- Net Benefit vs Threshold",
             fontsize=14, color="#e9f1f8", y=1.02)
plt.tight_layout()
plt.savefig(os.path.join(OUT, "dca_curves.png"), bbox_inches="tight",
            facecolor="#0d1b2a")
plt.close()

pd.DataFrame(dca_rows).to_csv(os.path.join(OUT, "dca_results.csv"), index=False)
print("Saved: dca_curves.png, dca_results.csv")


# %%
# ---------------- Section C: Subgroup analysis by gender ----------------
print("\n" + "=" * 60)
print("C. SUBGROUP ANALYSIS -- GENDER")
print("=" * 60)

# gender is label-encoded from 02_preprocessing.py. LabelEncoder sorts
# alphabetically by default, so for {"Female", "Male"} -> Female=0, Male=1.
# Confirm by loading raw dat.csv counts if needed.
if "gender" not in X_test_original.columns:
    raise KeyError("gender column not found in X_test -- check preprocessing output.")

gender_col = X_test_original["gender"].values
GENDER_LABELS = {0: "Female", 1: "Male"}  # Verify against dat.csv if uncertain

gender_rows = []
for label in TARGETS:
    col = outcome_map[label]
    y_true = y_test[col].values.astype(int)
    y_prob = get_prob(models[label], X_test_sanitised)

    for g_val, g_name in GENDER_LABELS.items():
        mask = gender_col == g_val
        if mask.sum() < 20:
            print(f"  {label} / {g_name}: n={mask.sum()} too small, skipping")
            continue
        auc, lo, hi = bootstrap_auc(y_true[mask], y_prob[mask], n_boot=N_BOOT)
        gender_rows.append({
            "outcome": label,
            "subgroup": g_name,
            "n": int(mask.sum()),
            "n_positive": int(y_true[mask].sum()),
            "auroc": round(auc, 4),
            "ci_low": round(lo, 4),
            "ci_high": round(hi, 4),
        })
        print(f"  {label} / {g_name}: n={mask.sum()}, AUROC={auc:.3f} "
              f"[{lo:.3f}, {hi:.3f}]")

gender_df = pd.DataFrame(gender_rows)
gender_df.to_csv(os.path.join(OUT, "subgroup_gender.csv"), index=False)

# Forest plot
if not gender_df.empty:
    fig, ax = plt.subplots(figsize=(9, max(3, 0.6 * len(gender_df) + 1.5)))
    y_pos = np.arange(len(gender_df))
    ax.errorbar(
        gender_df["auroc"], y_pos,
        xerr=[gender_df["auroc"] - gender_df["ci_low"],
              gender_df["ci_high"] - gender_df["auroc"]],
        fmt="o", color="#5EEAD4", ecolor="#8ba4bb", capsize=4,
        markersize=8, markerfacecolor="#0D9B8A"
    )
    ax.axvline(0.5, color="#E07B39", linestyle="--", linewidth=1,
               label="Chance (AUROC=0.5)")
    ax.set_yticks(y_pos)
    ax.set_yticklabels(
        [f"{r.outcome} / {r.subgroup} (n={r.n})" for r in gender_df.itertuples()]
    )
    ax.set_xlabel("AUROC (95% CI)")
    ax.set_title("Subgroup AUROC by Gender", fontsize=12, pad=10, color="#e9f1f8")
    ax.set_xlim(0.3, 1.0)
    ax.grid(True, alpha=0.4, axis="x")
    ax.legend(loc="lower right", facecolor="#13263b", edgecolor="#2f4a66",
              labelcolor="#e9f1f8", fontsize=9)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "subgroup_gender.png"), bbox_inches="tight",
                facecolor="#0d1b2a")
    plt.close()

print("Saved: subgroup_gender.png, subgroup_gender.csv")


# %%
# ---------------- Section D: Subgroup analysis by CKD status ----------------
print("\n" + "=" * 60)
print("D. SUBGROUP ANALYSIS -- CKD STATUS")
print("=" * 60)

# CKD column after encoding -- use original name for lookup since X_test on disk has original names.
CKD_COL_ORIGINAL = "moderate.to.severe.chronic.kidney.disease"
if CKD_COL_ORIGINAL not in X_test_original.columns:
    raise KeyError(
        f"{CKD_COL_ORIGINAL} not found in X_test. "
        "Check preprocessing_meta.json for the exact column name."
    )

# CKD is already numeric (0/1) from raw data -- not label-encoded.
# Binarise just in case (values >0 -> 1).
ckd_col = (X_test_original[CKD_COL_ORIGINAL].fillna(0).values > 0).astype(int)
CKD_LABELS = {0: "No CKD", 1: "CKD"}

ckd_rows = []
for label in TARGETS:
    col = outcome_map[label]
    y_true = y_test[col].values.astype(int)
    y_prob = get_prob(models[label], X_test_sanitised)

    for c_val, c_name in CKD_LABELS.items():
        mask = ckd_col == c_val
        if mask.sum() < 20:
            print(f"  {label} / {c_name}: n={mask.sum()} too small, skipping")
            continue
        auc, lo, hi = bootstrap_auc(y_true[mask], y_prob[mask], n_boot=N_BOOT)
        prev = float(y_true[mask].mean())
        ckd_rows.append({
            "outcome": label,
            "subgroup": c_name,
            "n": int(mask.sum()),
            "n_positive": int(y_true[mask].sum()),
            "positive_rate": round(prev, 4),
            "auroc": round(auc, 4),
            "ci_low": round(lo, 4),
            "ci_high": round(hi, 4),
        })
        print(f"  {label} / {c_name}: n={mask.sum()} ({prev*100:.1f}% pos), "
              f"AUROC={auc:.3f} [{lo:.3f}, {hi:.3f}]")

ckd_df = pd.DataFrame(ckd_rows)
ckd_df.to_csv(os.path.join(OUT, "subgroup_ckd.csv"), index=False)

if not ckd_df.empty:
    fig, ax = plt.subplots(figsize=(9, max(3, 0.6 * len(ckd_df) + 1.5)))
    y_pos = np.arange(len(ckd_df))
    colors = ["#E07B39" if "No CKD" in s else "#5EEAD4" for s in ckd_df["subgroup"]]
    ax.errorbar(
        ckd_df["auroc"], y_pos,
        xerr=[ckd_df["auroc"] - ckd_df["ci_low"],
              ckd_df["ci_high"] - ckd_df["auroc"]],
        fmt="o", color="#5EEAD4", ecolor="#8ba4bb", capsize=4,
        markersize=8, markerfacecolor="#0D9B8A"
    )
    ax.axvline(0.5, color="#E07B39", linestyle="--", linewidth=1,
               label="Chance (AUROC=0.5)")
    ax.set_yticks(y_pos)
    ax.set_yticklabels(
        [f"{r.outcome} / {r.subgroup} (n={r.n})" for r in ckd_df.itertuples()]
    )
    ax.set_xlabel("AUROC (95% CI)")
    ax.set_title("Subgroup AUROC by CKD Status", fontsize=12, pad=10, color="#e9f1f8")
    ax.set_xlim(0.3, 1.0)
    ax.grid(True, alpha=0.4, axis="x")
    ax.legend(loc="lower right", facecolor="#13263b", edgecolor="#2f4a66",
              labelcolor="#e9f1f8", fontsize=9)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "subgroup_ckd.png"), bbox_inches="tight",
                facecolor="#0d1b2a")
    plt.close()

print("Saved: subgroup_ckd.png, subgroup_ckd.csv")


# %%
# ---------------- Consolidated summary ----------------
print("\n" + "=" * 60)
print("SCRIPT 10 COMPLETE")
print("=" * 60)

summary = {
    "calibration": calib_rows,
    "subgroup_gender": gender_rows,
    "subgroup_ckd": ckd_rows,
    "notes": {
        "calibration": "Brier score: lower is better (0 = perfect). ECE: lower is better.",
        "dca": "Net benefit > treat-all curve at clinically plausible thresholds means model is useful.",
        "subgroups": "Overlapping CIs across subgroups = no significant performance gap. "
                     "Strong AUROC drop in a subgroup = fairness concern or model limitation to flag in Ch 5.",
    },
}
with open(os.path.join(OUT, "advanced_evaluation_summary.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)

print(f"\nAll outputs written to: {OUT}/")
print("  calibration_curves.png     | calibration_metrics.csv")
print("  dca_curves.png             | dca_results.csv")
print("  subgroup_gender.png        | subgroup_gender.csv")
print("  subgroup_ckd.png           | subgroup_ckd.csv")
print("  advanced_evaluation_summary.json")
print("\nNext step: incorporate these into Chapter 4 (model evaluation).")
