---
type: ProjectLayout
title: HF-RISK — Predicting Heart Failure Outcomes with Machine Learning
metaTitle: HF-RISK — Heart Failure Outcome Prediction | MSc Research
metaDescription: A live MSc research journal building a machine learning tool to predict death and readmission risk in 2,008 heart failure patients — with SHAP explainability and a deployable clinical tool.
socialImage: /images/featured-Image2.jpg
colors: colors-a
date: '2026-02-21'
client: London Metropolitan University
description: >-
  A live research journal tracking an MSc project that builds a multi-horizon
  heart failure outcome predictor using 166 clinical variables, SHAP explainability,
  and a deployable Streamlit risk tool.
featuredImage:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK heart failure risk prediction research journal
media:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK research journal
---

## Project Overview

**HF-RISK** is an MSc Data Analytics research project building a machine learning system that predicts adverse outcomes — death and hospital readmission — at four timepoints after discharge for heart failure patients.

The dataset contains **2,008 real patients** and **166 clinical variables** from Zigong Fourth People's Hospital, published by Zhang et al. in *Scientific Data* (Nature, 2021).

[Open the full live journal ↗](/hf-risk/index.html)

## Live Research Journal

<iframe
  src="/hf-risk/index.html"
  title="HF-RISK Live Journal"
  style="width:100%;min-height:1400px;border:0;border-radius:14px;background:transparent;"
  loading="lazy"
></iframe>

## What Is Being Built

| Component | Description |
|---|---|
| **EDA** | Missingness maps, BNP distributions, NYHA outcome charts |
| **ML Models** | Logistic Regression, Random Forest, XGBoost, LightGBM |
| **Survival Models** | Cox Proportional Hazards + Random Survival Forest |
| **Explainability** | SHAP global feature importance + patient waterfall plots |
| **Clinical Tool** | Streamlit app — enter patient values, get risk score |

## How the Journal Updates

The page above reads `project-data.json`. To publish a progress update:

1. Edit `project-data.json` — change a task status or add a journal entry
2. Push the change to GitHub
3. The live page updates automatically within seconds

No coding, no rebuilding. Just a JSON edit.

## Dataset & Citations

- Zhang, Z. et al. (2021). Electronic healthcare records and external outcome data for hospitalised patients with heart failure. *Scientific Data*, 8, 46.
- Chicco, D. & Jurman, G. (2020). Machine learning can predict survival of patients with heart failure. *BMC Medical Informatics and Decision Making*, 20, 16.
