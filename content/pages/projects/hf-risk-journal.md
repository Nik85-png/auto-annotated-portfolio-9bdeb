---
type: ProjectLayout
title: HF-RISK — Predicting Heart Failure Outcomes with Machine Learning
metaTitle: HF-RISK — Heart Failure Outcome Prediction | MSc Research
metaDescription: Final MSc Data Analytics project using leakage-clean machine learning to predict heart failure outcomes, explain predictions with SHAP, and test external validation on MIMIC-IV.
socialImage: /images/featured-Image2.jpg
colors: colors-a
date: '2026-02-21'
client: London Metropolitan University
description: >-
  Leakage-clean machine-learning study predicting heart-failure outcomes on
  2,008 Zhang / PhysioNet patients across four horizons, explained with SHAP
  and tested directly on 42,990 MIMIC-IV patients without retraining.
featuredImage:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK heart failure risk prediction research project
media:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK final MSc project page
---

> ⚠️ **Research prototype — not for clinical use.** HF-RISK is an MSc dissertation project. It has not been clinically validated and must not be used to inform patient-care decisions.

## At a glance

**HF-RISK** is my final MSc Data Analytics project on machine learning for heart failure outcome prediction. It predicts death and readmission after hospitalisation, explains the model using SHAP, and tests whether models trained on one hospital cohort transfer to another.

The final pipeline uses **2,008 patients** from the Zhang / PhysioNet heart failure cohort and a **leakage-clean set of 143 predictors**. Administrative IDs, discharge timing, and post-outcome proxy variables were removed after audit checks — which lowered the headline AUROC, but made the results methodologically defensible.

| Variable | Value |
|---|---|
| Author | Nikunj Prajapati (24052351) |
| Course | MSc Data Analytics, London Metropolitan University |
| Primary cohort | Zhang / PhysioNet — 2,008 hospitalised HF patients |
| External cohort | MIMIC-IV — 42,990 patients, applied directly (no retraining) |
| Final feature count | 143 leakage-clean predictors |
| Primary outcome | 6-month mortality — XGBoost — AUROC **0.710** internal · **0.599** MIMIC-IV |

<a
  href="/hf-risk/index.html"
  style="display:inline-block;margin:14px 0 4px;padding:12px 18px;border-radius:999px;border:1px solid currentColor;text-decoration:none;font-size:12px;letter-spacing:.18em;text-transform:uppercase;"
>
  Open the full case study →
</a>

The full wide-screen page includes the interactive tool panel, leakage-audit walkthrough, SHAP drivers, the MIMIC-IV comparison, and the beyond-AUROC evaluation figures.

## The research tool

A Streamlit research prototype loads the final trained models and returns predicted risk for each outcome horizon.

- **Loads the final trained models** — Random Forest for short horizons, XGBoost for 6-month mortality and readmission.
- **Maps readable clinical labels to model-safe feature names** — BNP, LVEF, NYHA etc. resolve to the exact encoded columns the model was trained on.
- **Fills missing inputs with training medians** — same defaults used during development.
- **Returns predicted risks, not decisions** — output is a probability, not a recommendation.

It is a **research prototype only** — a demo of the pipeline's behaviour, not a clinical tool. There is no live clinical deployment. The full project page embeds a non-clinical demo form; the source also runs locally:

```
git clone github.com/Nik85-png/hf-risk
cd hf-risk/MSc\ Project
pip install -r requirements.txt
streamlit run 06_streamlit_tool.py
```

## The leakage audit — and why AUROC went down

Earlier iterations of the 6-month mortality model reached **AUROC 0.819**. An audit for administrative, temporal, and post-outcome proxy variables identified information no clinician would actually have at discharge. Removing it dropped internal AUROC to **0.710** and MIMIC-IV external AUROC to **0.599**. That drop is the project's integrity story — the dissertation reports the lower, defensible number.

| Outcome | Before strict audit | After strict audit | Δ | Final model |
|---|---:|---:|---:|---|
| 28-day mortality | 0.893 | **0.781** | −0.112 | Random Forest |
| 3-month mortality | 0.919 | **0.839** | −0.080 | Random Forest |
| 6-month mortality | 0.819 | **0.710** | −0.109 | XGBoost |
| 6-month readmission | 0.648 | **0.650** | +0.002 | XGBoost |

**Variables removed by the audit:** `Unnamed: 0`, `inpatient.number`, `dischargeDay`, `outcome.during.hospitalization`, and readmission / emergency-return timing proxies.

## Final internal results

Held-out test AUROC on the Zhang cohort, after strict leakage and proxy-variable removal. These are the dissertation-safe figures.

| Outcome | Final best model | Held-out test AUROC |
|---|---|---:|
| 28-day mortality | Random Forest | **0.781** |
| 3-month mortality | Random Forest | **0.839** |
| 6-month mortality | XGBoost | **0.710** |
| 6-month readmission | XGBoost | **0.650** |

## Model drivers — what the final model actually uses

After removing audit-flagged variables, SHAP surfaces clinically meaningful signals rather than dataset artefacts. Earlier versions of the ranking had *discharge day* near the top — it encoded hospital-process timing rather than patient physiology and was removed. The revised top drivers:

1. **GCS** — Glasgow Coma Scale (neurological status)
2. **Moderate-to-severe CKD** — renal comorbidity flag
3. **Mitral valve AMS** — valve function
4. **LV end-diastolic diameter** — ventricular remodelling
5. **Liver disease** — hepatic comorbidity
6. **Congestive heart failure** — primary diagnosis flag
7. **Eye opening** — GCS sub-component
8. **Reduced EF flag** — LVEF below 40 %
9. **Basophil ratio** — haematological biomarker
10. **Creatine kinase** — cardiac / muscle injury biomarker

The ranking is dominated by neurological status, renal function, cardiac structure, and lab biomarkers — consistent with clinical expectation for heart-failure prognosis.

## External validation on MIMIC-IV

This is **not** a MIMIC-only model. The Zhang-trained models were applied **directly** to 42,990 MIMIC-IV patients **without retraining** — a strict transportability test across a different hospital system, country, and case-mix.

| Outcome | Internal (Zhang) | External (MIMIC-IV) |
|---|---:|---:|
| 28-day mortality | 0.781 | **0.524** |
| 6-month mortality | 0.710 | **0.599** |

The 28-day result is close to chance — unsurprising given class-mix and coding differences between the cohorts. The 6-month result retains signal above chance but is substantially lower than internal performance. **Reported as a transportability check, not a clinical claim.**

## Beyond AUROC

The full evaluation goes past headline AUROC:

- **Calibration** — Brier score **0.027** and ECE **0.023** at 6 months.
- **Decision-curve analysis** — net benefit vs. treat-all and treat-none baselines across threshold probabilities.
- **Subgroup checks** — pre-specified stratification by CKD status and gender.
- **Survival modelling** — complementary Cox proportional-hazards and Random Survival Forest models.

All figures — calibration curves, DCA, AUROC heatmap, Kaplan-Meier by NYHA, Cox forest plot, subgroup plots, SHAP beeswarm and global importance — are on the [full project page](/hf-risk/index.html).

## Process, in four tracks

1. **Develop** — literature, data audit, preprocessing, feature engineering. MICE imputation for moderately-missing clinical variables; SMOTE strictly inside CV.
2. **Audit** — systematic review of the predictor list for administrative IDs, discharge-timing variables, and post-outcome proxies. Five categories removed.
3. **Explain** — SHAP global and per-patient explanations on the final model. Checked that top drivers are clinically plausible rather than dataset artefacts.
4. **Validate** — Zhang-trained models applied directly to MIMIC-IV plus calibration, DCA, and pre-specified subgroup checks.

## Dataset & citations

- Zhang, Z. et al. (2021). *Electronic healthcare records and external outcome data for hospitalised patients with heart failure.* **Scientific Data**, 8, 46.
- Goldberger et al. (2000). *PhysioBank, PhysioToolkit, PhysioNet.* **Circulation** 101(23), e215-e220.
- Johnson, A. et al. **MIMIC-IV.** PhysioNet — external validation cohort, applied without retraining.
- Chicco, D. & Jurman, G. (2020). *Machine learning can predict survival of patients with heart failure.* **BMC Medical Informatics and Decision Making**, 20, 16 — baseline AUC ≈ 0.73.
- Lundberg et al. (2020). *From local explanations to global understanding.* **Nature Machine Intelligence** — SHAP methodology.

> ⚠️ **Reminder — research prototype only.** HF-RISK has not undergone clinical evaluation, regulatory assessment, or prospective testing. Do not use it to inform diagnosis, triage, treatment, or any patient-care decision. Any public re-use should cite the conservative leakage-clean figures above, not the pre-audit numbers.

[Open the full HF-RISK case-study page →](/hf-risk/index.html)
