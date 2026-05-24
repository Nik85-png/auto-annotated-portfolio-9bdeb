# %% [markdown]
# # 03 — Machine Learning Modelling
# **HF-RISK | MSc Data Analytics | Nikunj Prajapati (24052351)**
#
# Trains 5 models per outcome (Logistic Regression, Decision Tree, Random Forest,
# XGBoost, LightGBM) using 5-fold stratified cross-validation.
# Reports AUROC, Sensitivity (Recall), Specificity, F1, and Precision.
# Produces ROC curves and a comparison table.

# %%
import os, warnings, json, joblib, re
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from imblearn.over_sampling import BorderlineSMOTE
from imblearn.pipeline import Pipeline as ImbPipeline

from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics import (
    roc_auc_score, roc_curve, f1_score, precision_score,
    recall_score, confusion_matrix, make_scorer
)

plt.rcParams.update({
    'figure.facecolor': '#0d1b2a', 'axes.facecolor': '#13263b',
    'axes.edgecolor':   '#2f4a66', 'axes.labelcolor': '#c8d7e5',
    'xtick.color':      '#8ba4bb', 'ytick.color':     '#8ba4bb',
    'text.color':       '#e9f1f8', 'grid.color':       '#1e3a55',
    'grid.linestyle':   '--',      'grid.alpha':        0.6,
    'font.family':      'monospace', 'figure.dpi':       120,
})

PALETTE = ['#2a9d8f', '#f4a261', '#e76f51', '#e9c46a', '#98e2d7']

OUT = os.path.join('outputs', 'modelling')
os.makedirs(OUT, exist_ok=True)

print("✓ Imports OK")

# %%
# ─── Load preprocessed data ───────────────────────────────────────────────────
X_train = pd.read_csv(os.path.join('outputs', 'X_train.csv'))
X_test  = pd.read_csv(os.path.join('outputs', 'X_test.csv'))
y_train = pd.read_csv(os.path.join('outputs', 'y_train.csv'))
y_test  = pd.read_csv(os.path.join('outputs', 'y_test.csv'))

with open(os.path.join('outputs', 'outcome_map.json')) as f:
    OUTCOME_MAP = json.load(f)

# Filter to outcomes that exist
OUTCOME_MAP = {k: v for k, v in OUTCOME_MAP.items() if v and v in y_train.columns}
print(f"Targets: {list(OUTCOME_MAP.keys())}")
print(f"X_train: {X_train.shape} | X_test: {X_test.shape}")

# LightGBM rejects special JSON chars in feature names, so sanitize once for all models.
orig_cols = X_train.columns.tolist()
safe_cols = []
for c in orig_cols:
    safe = re.sub(r"[^0-9A-Za-z_]", "_", c)
    safe_cols.append(safe)

seen = {}
deduped = []
for c in safe_cols:
    k = seen.get(c, 0)
    deduped_name = f"{c}_{k}" if k else c
    seen[c] = k + 1
    deduped.append(deduped_name)

feature_name_map = dict(zip(orig_cols, deduped))
X_train = X_train.rename(columns=feature_name_map)
X_test = X_test.rename(columns=feature_name_map)

with open(os.path.join('outputs', 'feature_name_map.json'), 'w', encoding='utf-8') as f:
    json.dump(feature_name_map, f, indent=2)

# %%
# ─── Model definitions ────────────────────────────────────────────────────────
MODELS = {
    'Logistic Regression': LogisticRegression(
        max_iter=1000, solver='lbfgs', class_weight='balanced', random_state=42),
    'Decision Tree': DecisionTreeClassifier(
        max_depth=6, class_weight='balanced', random_state=42),
    'Random Forest': RandomForestClassifier(
        n_estimators=200, max_depth=None, class_weight='balanced',
        n_jobs=1, random_state=42),
    'XGBoost': XGBClassifier(
        n_estimators=200, learning_rate=0.05, max_depth=6,
        subsample=0.8, colsample_bytree=0.8,
        use_label_encoder=False, eval_metric='logloss',
        n_jobs=1, random_state=42, verbosity=0),
    'LightGBM': LGBMClassifier(
        n_estimators=200, learning_rate=0.05, max_depth=6,
        subsample=0.8, colsample_bytree=0.8,
        class_weight='balanced',
        n_jobs=1, random_state=42, verbose=-1),
}

# Determine if BorderlineSMOTE is needed (only for very imbalanced targets, i.e. <10% positive)
def needs_smote(y_series):
    return y_series.mean() < 0.10

# %%
# ─── Custom scorers ───────────────────────────────────────────────────────────
def specificity_score(y_true, y_pred):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return tn / (tn + fp) if (tn + fp) > 0 else 0.0

scoring = {
    'auroc':       'roc_auc',
    'f1':          make_scorer(f1_score, zero_division=0),
    'sensitivity': make_scorer(recall_score, zero_division=0),
    'specificity': make_scorer(specificity_score),
    'precision':   make_scorer(precision_score, zero_division=0),
}

CV = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# %%
# ─── Main training loop ───────────────────────────────────────────────────────
# Trains all 5 models × all outcome targets using 5-fold CV
# Saves best model per outcome to models/

all_results = []
best_models = {}    # outcome_label → {model_name, model_obj}

for outcome_label, outcome_col in OUTCOME_MAP.items():
    print(f"\n{'='*60}")
    print(f"OUTCOME: {outcome_label} ({outcome_col})")
    print(f"  Positive rate (train): {y_train[outcome_col].mean()*100:.1f}%")
    print(f"{'='*60}")

    y_tr = y_train[outcome_col]
    y_te = y_test[outcome_col]
    apply_smote = needs_smote(y_tr)
    print(f"  BorderlineSMOTE: {'YES' if apply_smote else 'no (balanced enough)'}")

    best_auc  = -1
    best_sel_score = -1
    best_name = None
    best_model_obj = None

    for model_name, base_model in MODELS.items():
        print(f"\n  Training {model_name} ...", end=' ', flush=True)

        if apply_smote:
            # Wrap in imbalanced-learn pipeline so BorderlineSMOTE is applied inside each CV fold
            smote = BorderlineSMOTE(random_state=42, k_neighbors=max(1, min(5, int(y_tr.sum()) - 1)))
            model = ImbPipeline([('smote', smote), ('clf', base_model)])
        else:
            model = base_model

        # 5-fold CV
        cv_results = cross_validate(
            model, X_train, y_tr, cv=CV,
            scoring=scoring, n_jobs=1, return_train_score=False
        )

        mean_auc  = cv_results['test_auroc'].mean()
        mean_f1   = cv_results['test_f1'].mean()
        mean_sens = cv_results['test_sensitivity'].mean()
        mean_spec = cv_results['test_specificity'].mean()
        mean_prec = cv_results['test_precision'].mean()
        std_auc   = cv_results['test_auroc'].std()

        print(f"AUROC={mean_auc:.3f} (±{std_auc:.3f}) | "
              f"F1={mean_f1:.3f} | Sens={mean_sens:.3f} | Spec={mean_spec:.3f}")

        all_results.append({
            'outcome':     outcome_label,
            'model':       model_name,
            'auroc_mean':  round(mean_auc, 4),
            'auroc_std':   round(std_auc, 4),
            'f1':          round(mean_f1, 4),
            'sensitivity': round(mean_sens, 4),
            'specificity': round(mean_spec, 4),
            'precision':   round(mean_prec, 4),
        })

        sel_score = mean_auc if not np.isnan(mean_auc) else mean_f1
        if sel_score > best_sel_score:
            best_sel_score = sel_score
            best_auc = mean_auc if not np.isnan(mean_auc) else -1
            best_name = model_name
            best_model_obj = model

    # Retrain best model on full training set and evaluate on held-out test set
    auc_txt = f"{best_auc:.3f}" if best_auc >= 0 else "nan (selected by F1 fallback)"
    print(f"\n  ★ Best model: {best_name} (CV AUROC = {auc_txt})")
    print(f"    Retraining on full train set and evaluating on test set...")

    best_model_obj.fit(X_train, y_tr)
    y_prob = best_model_obj.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_te, y_prob)
    print(f"    Test set AUROC = {test_auc:.3f}")

    best_models[outcome_label] = {
        'name':  best_name,
        'model': best_model_obj,
        'test_auc': round(test_auc, 4),
        'prob':  y_prob,
        'y_true': y_te.values,
    }

    # Save model
    model_path = os.path.join('models', f'best_model_{outcome_label}.pkl')
    joblib.dump(best_model_obj, model_path)
    print(f"    Saved → {model_path}")

# %%
# ─── Results table ────────────────────────────────────────────────────────────
results_df = pd.DataFrame(all_results)
print("\n── Full Results Table ──\n")
print(results_df.to_string(index=False))

results_df.to_csv(os.path.join(OUT, 'model_results.csv'), index=False)
print("\n✓ Saved model_results.csv")

# %%
# ─── ROC curves — one subplot per outcome ─────────────────────────────────────
n_outs = len(best_models)
fig, axes = plt.subplots(1, n_outs, figsize=(5 * n_outs, 5))
if n_outs == 1:
    axes = [axes]

for ax, (outcome_label, info) in zip(axes, best_models.items()):
    fpr, tpr, _ = roc_curve(info['y_true'], info['prob'])
    auc = info['test_auc']
    ax.plot(fpr, tpr, color='#2a9d8f', linewidth=2,
            label=f"{info['name']}\nAUROC = {auc:.3f}")
    ax.plot([0, 1], [0, 1], color='#2f4a66', linestyle='--', linewidth=1, label='Random (0.5)')
    # Benchmark line
    ax.axhline(0.73, xmin=0, xmax=1, color='#f4a261', linestyle=':', linewidth=1.2,
               label='Chicco benchmark (0.73)')
    ax.set_xlim(0, 1);  ax.set_ylim(0, 1.02)
    ax.set_xlabel('False Positive Rate')
    ax.set_ylabel('True Positive Rate')
    ax.set_title(f'{outcome_label}', fontsize=11, fontweight='bold', pad=8)
    ax.legend(fontsize=8, loc='lower right')
    ax.grid(True)

plt.suptitle('ROC Curves — Best Model per Outcome', fontsize=13, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig(os.path.join(OUT, 'roc_curves.png'), bbox_inches='tight')
plt.show()
print("✓ Saved roc_curves.png")

# %%
# ─── AUROC heatmap comparison (all models × all outcomes) ─────────────────────
pivot = results_df.pivot(index='model', columns='outcome', values='auroc_mean')
pivot = pivot.reindex(['Logistic Regression', 'Decision Tree', 'Random Forest', 'XGBoost', 'LightGBM'])

fig, ax = plt.subplots(figsize=(max(8, 2.5 * len(pivot.columns)), 4))
im = ax.imshow(pivot.values, cmap='YlGn', aspect='auto', vmin=0.5, vmax=1.0)
plt.colorbar(im, ax=ax, shrink=0.8, label='AUROC')
ax.set_xticks(range(len(pivot.columns)));  ax.set_xticklabels(pivot.columns, rotation=20, ha='right')
ax.set_yticks(range(len(pivot.index)));    ax.set_yticklabels(pivot.index)

for i in range(len(pivot.index)):
    for j in range(len(pivot.columns)):
        val = pivot.iloc[i, j]
        ax.text(j, i, f'{val:.3f}', ha='center', va='center',
                fontsize=10, color='#0d1b2a' if val > 0.75 else '#e9f1f8', fontweight='bold')

ax.set_title('5-Fold CV AUROC — All Models × All Outcomes', fontsize=12, fontweight='bold', pad=10)
plt.tight_layout()
plt.savefig(os.path.join(OUT, 'auroc_heatmap.png'), bbox_inches='tight')
plt.show()
print("✓ Saved auroc_heatmap.png")

# %%
# ─── Save best model info for SHAP script ─────────────────────────────────────
best_info = {k: {'name': v['name'], 'test_auc': v['test_auc']}
             for k, v in best_models.items()}
with open(os.path.join('outputs', 'best_models_info.json'), 'w') as f:
    json.dump(best_info, f, indent=2)
print("✓ Saved best_models_info.json")

# %%
print("\n✅ Modelling complete")
print("   Best models saved to models/best_model_*.pkl")
print("   Results tables in outputs/modelling/")
print("\n   Next step: run 04_survival.py  or  05_shap.py")
