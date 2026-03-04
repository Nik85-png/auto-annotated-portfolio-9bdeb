# %% [markdown]
# # 01 — Exploratory Data Analysis
# **HF-RISK | MSc Data Analytics | Nikunj Prajapati (24052351)**
#
# This notebook loads the dataset for the first time, profiles every variable,
# maps missingness, visualises the key clinical features, and defines the four
# outcome targets.  All output figures save to `../outputs/eda/`.

# %%
# ─── Imports ──────────────────────────────────────────────────────────────────
import os
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import seaborn as sns
import missingno as msno

# Output folder
OUT = os.path.join('outputs', 'eda')
os.makedirs(OUT, exist_ok=True)

# Matplotlib style
plt.rcParams.update({
    'figure.facecolor': '#0d1b2a',
    'axes.facecolor':   '#13263b',
    'axes.edgecolor':   '#2f4a66',
    'axes.labelcolor':  '#c8d7e5',
    'xtick.color':      '#8ba4bb',
    'ytick.color':      '#8ba4bb',
    'text.color':       '#e9f1f8',
    'grid.color':       '#1e3a55',
    'grid.linestyle':   '--',
    'grid.alpha':       0.6,
    'font.family':      'monospace',
    'figure.dpi':       120,
})

PALETTE = ['#2a9d8f', '#f4a261', '#e76f51', '#264653', '#e9c46a']

print("✓ Imports OK")

# %%
# ─── Load data ────────────────────────────────────────────────────────────────
df = pd.read_csv(os.path.join('data', 'dat.csv'))

print(f"Dataset shape : {df.shape[0]:,} patients × {df.shape[1]} variables")
print(f"Memory usage  : {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")
df.head(3)

# %%
# ─── Basic dtypes / value counts ──────────────────────────────────────────────
print("── dtype breakdown ──")
print(df.dtypes.value_counts())

print("\n── numeric columns ──")
print(df.select_dtypes(include='number').shape[1], "numeric columns")
print("\n── object / categorical columns ──")
print(df.select_dtypes(include='object').shape[1], "object columns")

# %%
# ─── Describe numeric variables ───────────────────────────────────────────────
numeric_summary = df.describe().T
numeric_summary['missing_pct'] = df.isnull().mean() * 100
numeric_summary = numeric_summary.sort_values('missing_pct', ascending=False)
print(numeric_summary.head(20))

# %%
# ─── OUTCOME VARIABLES — define and inspect ───────────────────────────────────
# The four targets from the project guide:
OUTCOMES = {
    '28d_death':        'death.within.28.days',
    '3m_death':         'death.within.3.months',
    '6m_death':         'death.within.6.months',
    '6m_readmission':   're.admission.within.6.months',
}

# Try exact match first, then fuzzy match on column names
def find_col(candidates, keyword):
    for c in candidates:
        if keyword.lower().replace(' ', '.') in c.lower():
            return c
    return None

cols_lower = {c.lower(): c for c in df.columns}

print("── Outcome Variable Presence ──")
for label, guess in OUTCOMES.items():
    exact = guess if guess in df.columns else None
    fuzzy = None
    if exact is None:
        for col in df.columns:
            if all(k in col.lower() for k in ['death', '28']) and '28d' in label:
                fuzzy = col; break
            if all(k in col.lower() for k in ['death', '3']) and '3m' in label:
                fuzzy = col; break
            if all(k in col.lower() for k in ['death', '6']) and '6m_death' in label:
                fuzzy = col; break
            if all(k in col.lower() for k in ['admi', '6']) and '6m_read' in label:
                fuzzy = col; break
    found = exact or fuzzy
    OUTCOMES[label] = found
    if found:
        vc = df[found].value_counts(dropna=False)
        pos_pct = (df[found] == 1).mean() * 100 if found else 0
        print(f"  {label:20s} → {found!r:45s} | positive: {pos_pct:.1f}%")
    else:
        print(f"  {label:20s} → ⚠ NOT FOUND — check column names")

# %%
# ─── Outcome bar chart ────────────────────────────────────────────────────────
found_outcomes = {k: v for k, v in OUTCOMES.items() if v is not None}

if found_outcomes:
    fig, axes = plt.subplots(1, len(found_outcomes), figsize=(4 * len(found_outcomes), 4), sharey=False)
    if len(found_outcomes) == 1:
        axes = [axes]

    for ax, (label, col) in zip(axes, found_outcomes.items()):
        counts = df[col].value_counts(dropna=False).sort_index()
        bars = ax.bar(['Negative (0)', 'Positive (1)'],
                      [counts.get(0, 0), counts.get(1, 0)],
                      color=[PALETTE[0], PALETTE[2]], width=0.5, edgecolor='none')
        for bar, count in zip(bars, [counts.get(0, 0), counts.get(1, 0)]):
            pct = count / len(df) * 100
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 10,
                    f'{pct:.1f}%', ha='center', fontsize=9, color='#e9f1f8')
        ax.set_title(label, fontsize=11, pad=8)
        ax.set_ylabel('Patients', fontsize=9)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f'{int(x):,}'))
        ax.grid(axis='y')

    plt.suptitle('Class Balance — Four Outcome Targets', fontsize=13, y=1.02, fontweight='bold')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, 'outcome_class_balance.png'), bbox_inches='tight')
    plt.show()
    print(f"✓ Saved outcome_class_balance.png")

# %%
# ─── MISSINGNESS — overall heatmap ────────────────────────────────────────────
miss = (df.isnull().mean() * 100).sort_values(ascending=False)

print(f"\n── Variables by missingness tier ──")
print(f"  0% missing      : {(miss == 0).sum():>4d} variables")
print(f"  1–30% missing   : {((miss > 0) & (miss <= 30)).sum():>4d} variables")
print(f"  31–70% missing  : {((miss > 30) & (miss <= 70)).sum():>4d} variables")
print(f"  >70% missing    : {(miss > 70).sum():>4d} variables")
print(f"  100% missing    : {(miss == 100).sum():>4d} variables  ← WILL BE DROPPED")

# Variables to drop (100% missing)
drop_cols = miss[miss == 100].index.tolist()
print(f"\nColumns to drop: {drop_cols}")

# %%
# ─── Missingness bar chart (top 40 worst variables) ───────────────────────────
top_miss = miss[miss > 0].head(40)

fig, ax = plt.subplots(figsize=(14, 7))
bars = ax.barh(top_miss.index, top_miss.values,
               color=[('#e76f51' if v >= 70 else '#e9c46a' if v >= 30 else '#2a9d8f')
                      for v in top_miss.values],
               edgecolor='none', height=0.7)
ax.axvline(30, color='#8ba4bb', linestyle='--', linewidth=1, label='30% threshold')
ax.axvline(70, color='#f4a261', linestyle='--', linewidth=1, label='70% threshold')
ax.set_xlabel('Missing (%)', fontsize=10)
ax.set_title('Top 40 Variables by Missing Data %', fontsize=13, pad=10, fontweight='bold')
ax.legend(fontsize=9)
ax.invert_yaxis()
ax.grid(axis='x')
plt.tight_layout()
plt.savefig(os.path.join(OUT, 'missingness_bar.png'), bbox_inches='tight')
plt.show()
print("✓ Saved missingness_bar.png")

# %%
# ─── Missingno matrix (visual pattern) ────────────────────────────────────────
# Show the 40 most-missing columns to detect structural patterns
high_miss_cols = miss[miss > 5].head(40).index.tolist()
fig, ax = plt.subplots(figsize=(16, 6))
msno.matrix(df[high_miss_cols], ax=ax, color=(0.165, 0.6, 0.56), fontsize=7)
ax.set_title('Missingness Pattern — Top 40 Incomplete Variables', fontsize=12, pad=10)
plt.tight_layout()
plt.savefig(os.path.join(OUT, 'missingness_matrix.png'), bbox_inches='tight')
plt.show()
print("✓ Saved missingness_matrix.png")

# %%
# ─── KEY CLINICAL VARIABLES — distributions ───────────────────────────────────
# BNP — the most important predictor
BNP_CANDIDATES = [c for c in df.columns if 'bnp' in c.lower() or 'brain' in c.lower()]
LVEF_CANDIDATES = [c for c in df.columns if 'lvef' in c.lower() or 'ejection' in c.lower() or 'ef' in c.lower()]
NYHA_CANDIDATES = [c for c in df.columns if 'nyha' in c.lower()]

print(f"BNP columns found  : {BNP_CANDIDATES}")
print(f"LVEF columns found : {LVEF_CANDIDATES}")
print(f"NYHA columns found : {NYHA_CANDIDATES}")

# %%
# ─── BNP distribution ─────────────────────────────────────────────────────────
if BNP_CANDIDATES:
    bnp_col = BNP_CANDIDATES[0]
    bnp = df[bnp_col].dropna()

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # Raw distribution
    axes[0].hist(bnp, bins=80, color=PALETTE[0], edgecolor='none', alpha=0.85)
    axes[0].axvline(400,  color=PALETTE[2], linestyle='--', label='Danger threshold (400)')
    axes[0].axvline(bnp.mean(), color=PALETTE[1], linestyle='-', label=f'Mean ({bnp.mean():.0f})')
    axes[0].set_title(f'{bnp_col} — Raw Distribution', fontsize=11, pad=8)
    axes[0].set_xlabel('BNP (pg/mL)')
    axes[0].set_ylabel('Patients')
    axes[0].legend(fontsize=8)
    axes[0].grid(axis='y')

    # Log-transformed (will be used after feature engineering)
    log_bnp = np.log1p(bnp)
    axes[1].hist(log_bnp, bins=60, color=PALETTE[1], edgecolor='none', alpha=0.85)
    axes[1].set_title(f'{bnp_col} — log(1+x) Transformed', fontsize=11, pad=8)
    axes[1].set_xlabel('log(1 + BNP)')
    axes[1].set_ylabel('Patients')
    axes[1].grid(axis='y')

    skew_raw = bnp.skew()
    skew_log = log_bnp.skew()
    print(f"BNP — n={len(bnp):,} | mean={bnp.mean():.0f} | median={bnp.median():.0f} | skew(raw)={skew_raw:.1f} → skew(log)={skew_log:.2f}")

    plt.suptitle('BNP — Raw vs Log Transform', fontsize=13, fontweight='bold', y=1.01)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, 'bnp_distribution.png'), bbox_inches='tight')
    plt.show()
    print("✓ Saved bnp_distribution.png")

# %%
# ─── BNP violin by outcome ────────────────────────────────────────────────────
if BNP_CANDIDATES and found_outcomes:
    bnp_col    = BNP_CANDIDATES[0]
    target_col = OUTCOMES.get('6m_death') or list(found_outcomes.values())[0]

    if target_col:
        fig, ax = plt.subplots(figsize=(8, 5))
        plot_df = df[[bnp_col, target_col]].dropna()
        plot_df[target_col] = plot_df[target_col].map({0: 'Survived (0)', 1: 'Died (1)'})

        sns.violinplot(data=plot_df, x=target_col, y=bnp_col, ax=ax,
                       palette={'Survived (0)': PALETTE[0], 'Died (1)': PALETTE[2]},
                       inner='box', cut=0)
        ax.set_yscale('log')
        ax.set_ylabel('BNP pg/mL  (log scale)', fontsize=10)
        ax.set_xlabel('')
        ax.set_title('BNP by 6-Month Mortality Outcome', fontsize=12, fontweight='bold', pad=10)
        ax.grid(axis='y')
        plt.tight_layout()
        plt.savefig(os.path.join(OUT, 'bnp_violin_outcome.png'), bbox_inches='tight')
        plt.show()
        print("✓ Saved bnp_violin_outcome.png")

# %%
# ─── LVEF distribution ────────────────────────────────────────────────────────
if LVEF_CANDIDATES:
    lvef_col = LVEF_CANDIDATES[0]
    lvef = df[lvef_col].dropna()

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.hist(lvef, bins=50, color=PALETTE[0], edgecolor='none', alpha=0.85)
    ax.axvline(40, color=PALETTE[2], linestyle='--', label='Severely reduced (<40%)')
    ax.axvline(55, color=PALETTE[1], linestyle='--', label='Normal lower bound (55%)')
    ax.set_title(f'LVEF Distribution — {len(lvef):,} patients with data ({len(lvef)/len(df)*100:.0f}% of cohort)',
                 fontsize=11, pad=8, fontweight='bold')
    ax.set_xlabel('LVEF (%)')
    ax.set_ylabel('Patients')
    ax.legend(fontsize=9)
    ax.grid(axis='y')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, 'lvef_distribution.png'), bbox_inches='tight')
    plt.show()
    print(f"LVEF — n={len(lvef):,} present ({df[lvef_col].isnull().mean()*100:.0f}% missing)")
    print(f"       mean={lvef.mean():.1f}% | median={lvef.median():.1f}% | <40%: {(lvef<40).mean()*100:.0f}%")

# %%
# ─── NYHA classification chart ────────────────────────────────────────────────
if NYHA_CANDIDATES:
    nyha_col = NYHA_CANDIDATES[0]
    nyha = df[nyha_col].dropna()

    fig, ax = plt.subplots(figsize=(8, 5))
    counts = nyha.value_counts().sort_index()
    bars = ax.bar(counts.index.astype(str), counts.values,
                  color=PALETTE[:len(counts)], edgecolor='none', width=0.6)
    for bar, count in zip(bars, counts.values):
        pct = count / len(nyha) * 100
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 5,
                f'{count:,}\n({pct:.0f}%)', ha='center', fontsize=10, color='#e9f1f8')
    ax.set_xlabel('NYHA Class', fontsize=10)
    ax.set_ylabel('Patients', fontsize=10)
    ax.set_title('NYHA Classification Distribution', fontsize=12, fontweight='bold', pad=10)
    ax.grid(axis='y')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, 'nyha_distribution.png'), bbox_inches='tight')
    plt.show()
    print(f"NYHA — {len(nyha):,} patients | {df[nyha_col].isnull().mean()*100:.0f}% missing")

# %%
# ─── AGE distribution ─────────────────────────────────────────────────────────
age_candidates = [c for c in df.columns if 'age' in c.lower()]
print(f"Age columns: {age_candidates}")

if age_candidates:
    age_col = age_candidates[0]
    age_data = df[age_col]

    # If age is categorical/string (e.g. "60-70") report value counts
    if age_data.dtype == object:
        print(age_data.value_counts().sort_index())
    else:
        fig, ax = plt.subplots(figsize=(9, 5))
        ax.hist(age_data.dropna(), bins=30, color=PALETTE[0], edgecolor='none', alpha=0.85)
        ax.set_title('Age Distribution', fontsize=12, fontweight='bold', pad=10)
        ax.set_xlabel('Age')
        ax.set_ylabel('Patients')
        ax.grid(axis='y')
        plt.tight_layout()
        plt.savefig(os.path.join(OUT, 'age_distribution.png'), bbox_inches='tight')
        plt.show()
        print(f"Age — mean={age_data.mean():.1f} | median={age_data.median():.1f}")

# %%
# ─── Correlation heatmap (numeric only, top 25 most varying) ──────────────────
numeric_df = df.select_dtypes(include='number')
# Pick the 25 columns with most variance (excluding outcomes)
outcome_cols = [v for v in OUTCOMES.values() if v is not None]
feature_cols = [c for c in numeric_df.columns if c not in outcome_cols]
top_var_cols = (numeric_df[feature_cols].var().sort_values(ascending=False).head(25).index.tolist())

corr = numeric_df[top_var_cols].corr()

fig, ax = plt.subplots(figsize=(14, 12))
mask = np.triu(np.ones_like(corr, dtype=bool))
cmap = sns.diverging_palette(210, 25, as_cmap=True)
sns.heatmap(corr, mask=mask, cmap=cmap, center=0, linewidths=0.4,
            annot=False, ax=ax, cbar_kws={'shrink': .8})
ax.set_title('Correlation — Top 25 Most Varied Features', fontsize=12, fontweight='bold', pad=12)
plt.tight_layout()
plt.savefig(os.path.join(OUT, 'correlation_heatmap.png'), bbox_inches='tight')
plt.show()
print("✓ Saved correlation_heatmap.png")

# %%
# ─── Table 1 — Patient Characteristics Summary ────────────────────────────────
# Produces the clinical summary table for Chapter 4 of your dissertation

key_vars_candidates = {
    'Age'             : [c for c in df.columns if 'age' in c.lower()],
    'BNP (pg/mL)'     : BNP_CANDIDATES,
    'LVEF (%)'        : LVEF_CANDIDATES,
    'NYHA Class'      : NYHA_CANDIDATES,
}

rows = []
for var_label, candidates in key_vars_candidates.items():
    if not candidates:
        continue
    col = candidates[0]
    if col not in df.columns:
        continue
    series = df[col].dropna()
    n = len(series)
    miss_n  = df[col].isnull().sum()
    miss_pct = miss_n / len(df) * 100

    if pd.api.types.is_numeric_dtype(series):
        rows.append({
            'Variable':    var_label,
            'N present':   f"{n:,}",
            'Missing':     f"{miss_n:,} ({miss_pct:.0f}%)",
            'Mean ± SD':   f"{series.mean():.1f} ± {series.std():.1f}",
            'Median [IQR]': f"{series.median():.1f} [{series.quantile(.25):.1f}–{series.quantile(.75):.1f}]",
        })
    else:
        modal = series.mode()[0]
        modal_n = (series == modal).sum()
        rows.append({
            'Variable':    var_label,
            'N present':   f"{n:,}",
            'Missing':     f"{miss_n:,} ({miss_pct:.0f}%)",
            'Mean ± SD':   f"Mode: {modal} ({modal_n/n*100:.0f}%)",
            'Median [IQR]': 'Categorical',
        })

table1 = pd.DataFrame(rows)
print("\n── Table 1 — Patient Characteristics ──\n")
print(table1.to_string(index=False))
table1.to_csv(os.path.join(OUT, 'table1_characteristics.csv'), index=False)
print("\n✓ Saved table1_characteristics.csv")

# %%
print("\n✅ EDA Complete — all outputs saved to outputs/eda/")
print("   Next step: run 02_preprocessing.py")
