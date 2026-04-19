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
  Final MSc project building leakage-clean heart failure outcome prediction
  models using 143 clinical predictors, SHAP explainability, MIMIC-IV external
  validation, and a Streamlit research prototype.
featuredImage:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK heart failure risk prediction research project
media:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK final MSc project page
---

## Project Overview

**HF-RISK** is my MSc Data Analytics project on machine learning for heart failure outcome prediction. It predicts adverse outcomes after discharge, explains the model using SHAP, and tests whether models trained on one hospital cohort transfer to MIMIC-IV.

The final pipeline uses **2,008 patients** from the Zhang / PhysioNet heart failure cohort and a strict leakage-clean feature set of **143 predictors**. Administrative IDs, discharge timing, and post-outcome proxy variables were removed after audit checks.

[Open the full HF-RISK project page ->](/hf-risk/index.html)

## Final Project Page

<iframe
  src="/hf-risk/index.html"
  title="HF-RISK Final MSc Project Page"
  style="width:100%;min-height:1400px;border:0;border-radius:14px;background:transparent;"
  loading="lazy"
></iframe>

## What Was Built

| Component | Description |
|---|---|
| **EDA** | Missingness maps, class balance, BNP/LVEF/NYHA summaries, and patient characteristics |
| **Leakage audit** | Removed patient ID, discharge timing, and post-outcome proxy variables before final modelling |
| **ML Models** | Logistic Regression, Decision Tree, Random Forest, XGBoost, and LightGBM across four outcomes |
| **Survival Models** | Kaplan-Meier, Cox Proportional Hazards, and Random Survival Forest |
| **Explainability** | SHAP global importance, beeswarm plots, and patient-level waterfall plots |
| **External validation** | Zhang-trained models tested directly on MIMIC-IV without retraining |
| **Research Tool** | Streamlit prototype for testing only, not for clinical decision-making |

## Final Results Snapshot

| Outcome | Final best model | Held-out test AUROC |
|---|---:|---:|
| 28-day mortality | Random Forest | 0.781 |
| 3-month mortality | Random Forest | 0.839 |
| 6-month mortality | XGBoost | 0.710 |
| 6-month readmission | XGBoost | 0.650 |

External validation on MIMIC-IV produced AUROC **0.524** for 28-day mortality and **0.599** for 6-month mortality, highlighting dataset shift and limited model transportability across healthcare systems.

The project deliberately reports the stricter leakage-clean results rather than the highest early AUROC, because the final model is methodologically more defensible.

## Dataset & Citations

- Zhang, Z. et al. (2021). Electronic healthcare records and external outcome data for hospitalised patients with heart failure. *Scientific Data*, 8, 46.
- Johnson, A. et al. MIMIC-IV. PhysioNet.
- Chicco, D. & Jurman, G. (2020). Machine learning can predict survival of patients with heart failure. *BMC Medical Informatics and Decision Making*, 20, 16.
