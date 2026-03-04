# %% [markdown]
# # 05 — SHAP Explainability
# **HF-RISK | MSc Data Analytics | Nikunj Prajapati (24052351)**
#
# Uses SHAP (SHapley Additive exPlanations) to explain the best trained model.
# Produces:
#  • Global summary beeswarm plot (top 20 features driving all predictions)
#  • Bar plot of mean |SHAP| values
#  • Dependence plot for BNP (most important predictor)
#  • Waterfall plot for individual patients (high-risk and low-risk examples)
#  • SHAP values exported to CSV for dissertation

# %%
import os, warnings, json, joblib
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import shap

plt.rcParams.update({
    'figure.facecolor': '#0d1b2a', 'axes.facecolor': '#13263b',
    'axes.edgecolor':   '#2f4a66', 'axes.labelcolor': '#c8d7e5',
    'xtick.color':      '#8ba4bb', 'ytick.color':     '#8ba4bb',
    'text.color':       '#e9f1f8', 'grid.color':       '#1e3a55',
    'grid.linestyle':   '--',      'grid.alpha':        0.6,
    'font.family':      'monospace', 'figure.dpi':       120,
})

OUT = os.path.join('outputs', 'shap')
os.makedirs(OUT, exist_ok=True)
print("✓ SHAP version:", shap.__version__)

# %%
# ─── Load test set and best model ─────────────────────────────────────────────
X_test  = pd.read_csv(os.path.join('outputs', 'X_test.csv'))
y_test  = pd.read_csv(os.path.join('outputs', 'y_test.csv'))

with open(os.path.join('outputs', 'outcome_map.json')) as f:
    OUTCOME_MAP = json.load(f)

with open(os.path.join('outputs', 'best_models_info.json')) as f:
    best_info = json.load(f)

# Keep feature naming consistent with modelling step (LightGBM-safe names).
feature_name_map_path = os.path.join('outputs', 'feature_name_map.json')
if os.path.exists(feature_name_map_path):
    with open(feature_name_map_path, 'r', encoding='utf-8') as f:
        feature_name_map = json.load(f)
    X_test = X_test.rename(columns=feature_name_map)

# Use the primary outcome (6m_death or the first available)
primary_label = '6m_death' if '6m_death' in OUTCOME_MAP and OUTCOME_MAP['6m_death'] else \
    next(iter(OUTCOME_MAP))
primary_col   = OUTCOME_MAP[primary_label]

model_path = os.path.join('models', f'best_model_{primary_label}.pkl')
model = joblib.load(model_path)
model_name = best_info.get(primary_label, {}).get('name', 'Best Model')
test_auc   = best_info.get(primary_label, {}).get('test_auc', '?')

print(f"Explaining: {model_name} on outcome '{primary_label}'")
print(f"Test AUROC : {test_auc}")
print(f"Test set   : {X_test.shape[0]:,} patients × {X_test.shape[1]} features")

# %%
# ─── Extract base classifier from pipeline (if SMOTE pipeline) ────────────────
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.pipeline import Pipeline as SkPipeline

def get_classifier(pipeline_or_model):
    """Extract the underlying classifier from a pipeline."""
    if isinstance(pipeline_or_model, (ImbPipeline, SkPipeline)):
        return pipeline_or_model.named_steps.get('clf') or pipeline_or_model[-1]
    return pipeline_or_model

clf = get_classifier(model)
print(f"Underlying classifier: {type(clf).__name__}")

# %%
# ─── Build SHAP explainer ─────────────────────────────────────────────────────
# TreeExplainer works for RF, XGBoost, LightGBM
# LinearExplainer works for LogisticRegression
# KernelExplainer works as fallback (slow)

print("\nBuilding SHAP explainer ...")

try:
    explainer = shap.TreeExplainer(clf)
    explanation_type = 'tree'
    print("✓ Using TreeExplainer (fast, exact)")
except Exception:
    try:
        background = shap.maskers.Independent(X_test, max_samples=100)
        explainer = shap.LinearExplainer(clf, background)
        explanation_type = 'linear'
        print("✓ Using LinearExplainer")
    except Exception:
        print("Falling back to KernelExplainer (slow, may take several minutes) ...")
        background = shap.sample(X_test, 100, random_state=42)
        explainer = shap.KernelExplainer(clf.predict_proba, background)
        explanation_type = 'kernel'

# %%
# ─── Compute SHAP values ──────────────────────────────────────────────────────
print("Computing SHAP values (may take 1–3 minutes for large datasets) ...")
shap_values_raw = explainer.shap_values(X_test)

# Handle multi-output / binary class [0, 1] output
if isinstance(shap_values_raw, list):
    # Binary: list[0]=negative class, list[1]=positive class
    shap_values = shap_values_raw[1]
    expected_value = (explainer.expected_value[1]
                      if hasattr(explainer.expected_value, '__len__')
                      else explainer.expected_value)
else:
    shap_values = shap_values_raw
    expected_value = explainer.expected_value

print(f"SHAP values shape: {shap_values.shape}")

# %%
# ─── Global Summary — Beeswarm plot ───────────────────────────────────────────
print("\nPlotting global summary (beeswarm) ...")

# shap's own plot with dark styling
plt.figure(figsize=(11, 8))
shap.summary_plot(
    shap_values, X_test,
    max_display=20,
    show=False,
    plot_size=None,
    color_bar=True,
)
plt.title(f'SHAP — Global Feature Importance\n{model_name} · {primary_label}',
          fontsize=12, fontweight='bold', pad=12)
plt.tight_layout()
plt.savefig(os.path.join(OUT, 'shap_beeswarm.png'), bbox_inches='tight')
plt.show()
print("✓ Saved shap_beeswarm.png")

# %%
# ─── Bar plot — Mean |SHAP| ────────────────────────────────────────────────────
mean_abs_shap = pd.Series(
    np.abs(shap_values).mean(axis=0),
    index=X_test.columns
).sort_values(ascending=False).head(20)

fig, ax = plt.subplots(figsize=(10, 7))
ax.barh(mean_abs_shap.index[::-1], mean_abs_shap.values[::-1],
        color='#2a9d8f', alpha=0.85, height=0.6)
ax.set_xlabel('Mean |SHAP value|  (average impact on model output)', fontsize=10)
ax.set_title(f'Top 20 Predictors — {model_name}\n(Mean absolute SHAP value)',
             fontsize=12, fontweight='bold', pad=10)
ax.grid(axis='x')
plt.tight_layout()
plt.savefig(os.path.join(OUT, 'shap_bar.png'), bbox_inches='tight')
plt.show()
print("✓ Saved shap_bar.png")

# %%
# ─── Print top predictors in clinical language ─────────────────────────────────
print("\n── Top 10 Predictors (what the model is learning) ──\n")
for rank, (feat, importance) in enumerate(mean_abs_shap.head(10).items(), start=1):
    print(f"  {rank:2d}. {feat:40s}  mean|SHAP| = {importance:.4f}")

print("\nClinical check — look for: log_bnp / BNP, LVEF / ejection, creatinine, NYHA")
print("If these are in the top 10 → model has learned clinically valid patterns ✓")

# %%
# ─── SHAP dependence plot — BNP ───────────────────────────────────────────────
bnp_feat = next((c for c in X_test.columns if 'bnp' in c.lower()), None)
lvef_feat = next((c for c in X_test.columns if 'lvef' in c.lower() or 'ejection' in c.lower()), None)

if bnp_feat:
    print(f"\nDependence plot for: {bnp_feat}")
    plt.figure(figsize=(9, 5))
    interact_col = lvef_feat or 'auto'
    shap.dependence_plot(
        bnp_feat, shap_values, X_test,
        interaction_index=interact_col if interact_col != 'auto' else None,
        show=False, dot_size=6, alpha=0.6,
    )
    plt.title(f'SHAP Dependence — {bnp_feat}', fontsize=11, fontweight='bold')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, 'shap_dependence_bnp.png'), bbox_inches='tight')
    plt.show()
    print("✓ Saved shap_dependence_bnp.png")

# %%
# ─── Waterfall plots — individual patients ────────────────────────────────────
# Grab model's probability predictions on test set
if isinstance(model, (ImbPipeline, SkPipeline)):
    proba = model.predict_proba(X_test)[:, 1]
else:
    proba = clf.predict_proba(X_test)[:, 1]

proba_series = pd.Series(proba, index=X_test.index)
y_te_series  = y_test[primary_col] if primary_col and primary_col in y_test.columns else None

# Pick one high-risk and one low-risk patient
high_risk_idx = proba_series.nlargest(5).index[0]
low_risk_idx  = proba_series.nsmallest(5).index[0]

for patient_idx, label in [(high_risk_idx, 'high_risk'), (low_risk_idx, 'low_risk')]:
    patient_proba = proba_series.loc[patient_idx]
    patient_pos   = X_test.index.get_loc(patient_idx)

    shap_explanation = shap.Explanation(
        values=shap_values[patient_pos],
        base_values=expected_value,
        data=X_test.iloc[patient_pos].values,
        feature_names=X_test.columns.tolist(),
    )

    plt.figure(figsize=(12, 7))
    shap.waterfall_plot(shap_explanation, max_display=15, show=False)
    plt.title(f'Patient Explanation — {label.replace("_", " ").title()}\n'
              f'Risk score = {patient_proba:.1%}  |  Outcome = {primary_label}',
              fontsize=11, fontweight='bold', pad=10)
    plt.tight_layout()
    fname = f'shap_waterfall_{label}.png'
    plt.savefig(os.path.join(OUT, fname), bbox_inches='tight')
    plt.show()
    print(f"✓ Saved {fname}  (predicted risk: {patient_proba:.1%})")

# %%
# ─── Export SHAP values to CSV ────────────────────────────────────────────────
shap_df = pd.DataFrame(shap_values, columns=X_test.columns, index=X_test.index)
shap_df['predicted_prob'] = proba
shap_df.to_csv(os.path.join(OUT, 'shap_values.csv'), index=True)
print("✓ Saved shap_values.csv — SHAP value for every feature for every patient")

# Export top 20 importance summary
mean_abs_shap.reset_index().rename(
    columns={'index': 'feature', 0: 'mean_abs_shap'}
).to_csv(os.path.join(OUT, 'shap_importance.csv'), index=False)
print("✓ Saved shap_importance.csv — for dissertation tables")

# %%
print("\n✅ SHAP explainability complete")
print("   Key files:")
print("   • outputs/shap/shap_beeswarm.png     — goes directly into dissertation")
print("   • outputs/shap/shap_bar.png           — top 20 predictor ranking")
print("   • outputs/shap/shap_waterfall_*.png  — individual patient examples")
print("   • outputs/shap/shap_values.csv        — all SHAP values for analysis")
print("\n   Compare top predictors to clinical literature:")
print("   BNP, LVEF, creatinine, NYHA, sodium, haemoglobin")
print("   If these dominate → your model has learned clinically valid patterns ✓")
