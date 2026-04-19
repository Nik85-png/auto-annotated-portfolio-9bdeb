# HF-RISK MSc Project Pipeline

Nikunj Prajapati | 24052351 | MSc Data Analytics | London Metropolitan University

This README explains the project in plain language: what data is used, which models are trained, how MIMIC-IV is tested, and what each script produces.

## 1. The Big Picture

The project asks:

> Can machine learning predict adverse outcomes after discharge for patients hospitalised with heart failure?

There are two datasets in the final project:

1. **Zhang / PhysioNet heart failure dataset**
   - File: `data/dat.csv`
   - 2,008 hospitalised heart failure patients.
   - Chinese hospital cohort.
   - This is the **main development dataset**.
   - Models are trained and internally tested on this dataset.

2. **MIMIC-IV heart failure cohort**
   - File: `data/mimic_hf_cohort.csv`
   - US hospital cohort from Beth Israel Deaconess Medical Center.
   - This is used for **external validation** and for a separate **MIMIC-only comparison model**.

The most important distinction:

> The main HF-RISK models are trained on the Chinese Zhang dataset. They are then tested on MIMIC-IV without retraining to check external generalisation.

The separate MIMIC-only model is not the main model. It is a comparison experiment to show what happens when a model is trained and tested within MIMIC itself.

## 2. Final Clean Feature Set

The final strict preprocessing removes variables that could create leakage or unfairly inflate performance.

Removed from predictors:

- `Unnamed: 0`
- `inpatient.number`
- `dischargeDay`
- `outcome.during.hospitalization`
- `re.admission.within.28.days`
- `re.admission.within.3.months`
- `re.admission.time..days.from.admission.`
- `return.to.emergency.department.within.6.months`
- `time.to.emergency.department.within.6.months`

Final clean feature set:

- `143` predictors
- `1,606` training patients
- `402` internal test patients

Why this matters:

The earlier model performance was higher, but some variables were administrative IDs, timing proxies, or post-outcome information. Removing them makes the final results lower but more defensible.

## 3. What The Pipeline Does

The scripts should be run in this order:

```text
01_eda.py
02_preprocessing.py
03_modelling.py
04_survival.py
05_shap.py
08_external_validation_mimic.py
09_mimic_only_xgboost.py
10_advanced_evaluation.py
```

Script `07_external_validation.py` is an older optional template. The final MIMIC external validation script is `08_external_validation_mimic.py`.

## 4. Script By Script Explanation

### `01_eda.py` - Exploratory Data Analysis

This script looks at the raw Zhang dataset before modelling.

It does:

- Loads `data/dat.csv`.
- Checks dataset size and variable types.
- Finds the four outcome variables.
- Shows class balance for each outcome.
- Maps missing data.
- Plots important clinical variables such as BNP, LVEF, NYHA class, and age.
- Creates a patient characteristics table.

Main outputs:

```text
outputs/eda/
```

Useful dissertation outputs:

- `outcome_class_balance.png`
- `missingness_bar.png`
- `missingness_matrix.png`
- `bnp_distribution.png`
- `bnp_violin_outcome.png`
- `lvef_distribution.png`
- `nyha_distribution.png`
- `correlation_heatmap.png`
- `table1_characteristics.csv`

Purpose in dissertation:

This supports the Data Understanding and Exploratory Analysis sections.

### `02_preprocessing.py` - Cleaning, Leakage Removal, Imputation, Train/Test Split

This is one of the most important scripts.

It does:

1. Loads the raw Zhang dataset.
2. Defines the four outcomes:
   - `28d_death`
   - `3m_death`
   - `6m_death`
   - `6m_readmission`
3. Drops variables with more than 80% missingness.
4. Drops near-zero-variance variables.
5. Encodes categorical variables.
6. Creates engineered features:
   - log BNP
   - high BNP flag
   - log creatinine
   - renal risk flag
   - reduced ejection fraction flag
   - age midpoint if age is categorical
7. Removes leakage and proxy variables.
8. Imputes missing values:
   - low missingness: median imputation
   - moderate missingness: MICE / Iterative Imputer
9. Splits the Zhang dataset into:
   - training set: 80%
   - test set: 20%

Main outputs:

```text
outputs/X_train.csv
outputs/X_test.csv
outputs/y_train.csv
outputs/y_test.csv
outputs/X_imputed_full.csv
outputs/feature_names.csv
outputs/outcome_map.json
outputs/preprocessing_meta.json
models/mice_imputer.pkl
```

Purpose in dissertation:

This supports the Data Preparation, Leakage Control, and Feature Engineering sections.

### `03_modelling.py` - Main Machine Learning Models

This script trains the main HF-RISK prediction models on the Zhang dataset.

Important:

> These models are trained on the Chinese Zhang dataset, not on MIMIC-IV.

Models trained:

- Logistic Regression
- Decision Tree
- Random Forest
- XGBoost
- LightGBM

Outcomes predicted:

- death within 28 days
- death within 3 months
- death within 6 months
- readmission within 6 months

The script uses:

- 5-fold stratified cross-validation on the training set.
- SMOTE for very imbalanced outcomes.
- Final test evaluation on the held-out Zhang test set.

Main outputs:

```text
outputs/modelling/model_results.csv
outputs/modelling/roc_curves.png
outputs/modelling/auroc_heatmap.png
outputs/best_models_info.json
outputs/feature_name_map.json
models/best_model_28d_death.pkl
models/best_model_3m_death.pkl
models/best_model_6m_death.pkl
models/best_model_6m_readmission.pkl
```

Final strict internal test results:

```text
28d_death       Random Forest   Test AUROC = 0.7811
3m_death        Random Forest   Test AUROC = 0.8392
6m_death        XGBoost         Test AUROC = 0.7098
6m_readmission  XGBoost         Test AUROC = 0.6497
```

Purpose in dissertation:

This supports the Main Modelling Results section.

### `04_survival.py` - Survival Analysis

This script handles time-to-event style analysis.

It does:

- Creates a 6-month mortality survival outcome.
- Builds time-to-event and event indicators.
- Produces a Kaplan-Meier plot by NYHA class.
- Fits a Cox Proportional Hazards model.
- Fits a Random Survival Forest model.

Important:

Some timing variables are allowed for constructing censoring/event time, but they are excluded from survival model predictors if they leak outcome information.

Main outputs:

```text
outputs/survival/km_by_nyha.png
outputs/survival/cox_forest_plot.png
models/cox_model.pkl
models/rsf_model.pkl
```

Note:

The current survival script saves plots and models, but it does not currently save a `survival_results.json` file.

Purpose in dissertation:

This supports a survival-analysis subsection and provides a complementary analysis beyond binary classification.

### `05_shap.py` - Explainability

This script explains the best model for the primary outcome, usually `6m_death`.

It loads:

```text
outputs/X_test.csv
outputs/y_test.csv
models/best_model_6m_death.pkl
outputs/best_models_info.json
outputs/feature_name_map.json
```

It then calculates SHAP values for the trained model.

Main outputs:

```text
outputs/shap/shap_beeswarm.png
outputs/shap/shap_bar.png
outputs/shap/shap_waterfall_high_risk.png
outputs/shap/shap_waterfall_low_risk.png
outputs/shap/shap_values.csv
outputs/shap/shap_importance.csv
```

Final top SHAP predictors after strict leakage removal:

```text
1. GCS
2. Moderate-to-severe chronic kidney disease
3. Mitral valve AMS
4. Left ventricular end-diastolic diameter
5. Liver disease
6. Congestive heart failure
7. Eye opening
8. Reduced EF flag
9. Basophil ratio
10. Creatine kinase
```

Purpose in dissertation:

This supports the Explainability and Clinical Interpretability section.

### `06_streamlit_tool.py` - Local Prediction Prototype

This is a small Streamlit app for demonstration.

It:

- Loads the trained best models.
- Shows input boxes for the 143 final features.
- Uses default values from the training data medians.
- Predicts risk for each outcome.
- Displays model predictions and proxy feature importance.

Important:

This tool is a research/testing prototype only. It has not been clinically validated and must not be used for patient-care decisions.

Run locally:

```bash
streamlit run 06_streamlit_tool.py
```

Purpose in dissertation:

This supports the prototype/tool objective, but it should be presented as a research demonstration, not as a deployed medical device.

### `08_external_validation_mimic.py` - Testing Zhang-Trained Models On MIMIC-IV

This script answers:

> If we train on the Chinese Zhang dataset, does the model work on a different US hospital dataset?

This is **external validation**.

Important:

> The models are not retrained on MIMIC-IV in this script.

What it does:

1. Loads `data/mimic_hf_cohort.csv`.
2. Loads the feature names expected by the Zhang-trained model.
3. Creates a MIMIC feature matrix with the same model feature names.
4. Maps MIMIC variables onto the closest matching Zhang model features.
5. Missing MIMIC features are imputed:
   - if a mapped feature has partial missingness, the MIMIC median is used
   - if a feature is entirely unavailable in MIMIC, it is filled with `0.0`
6. Loads the already-trained Zhang models from `models/best_model_*.pkl`.
7. Applies those Zhang-trained models directly to MIMIC patients.
8. Calculates external AUROC and confidence intervals.

Final external validation results:

```text
28-day mortality external AUROC  = 0.5235
6-month mortality external AUROC = 0.5995
```

Interpretation:

The models perform worse on MIMIC-IV than on the internal Zhang test set. This does not mean the project failed. It shows dataset shift: the model learned patterns from one hospital system that do not fully transfer to another.

Purpose in dissertation:

This supports the External Validation, Generalisability, and Dataset Shift sections.

### `09_mimic_only_xgboost.py` - Separate MIMIC-Only Model

This script is different from external validation.

It answers:

> If we train and test a model within MIMIC-IV itself, how well can MIMIC predict its own outcomes?

Important:

> This does train a separate model on MIMIC-IV. It is not the main HF-RISK model.

What it does:

1. Loads `mimic_hf_cohort.csv`.
2. Selects a smaller set of usable MIMIC variables.
3. Splits MIMIC into MIMIC train and MIMIC test sets.
4. Trains XGBoost on MIMIC.
5. Evaluates the MIMIC-trained model on MIMIC test data.

Why this is useful:

If MIMIC-only performance is good, but Zhang-to-MIMIC external performance is weak, then the problem is not that MIMIC has no predictive signal. The problem is transportability between datasets.

That is a strong dissertation point.

Purpose in dissertation:

This supports the Dataset Shift discussion and helps explain why external validation is hard.

### `10_advanced_evaluation.py` - Calibration, Decision Curve Analysis, Subgroups

This script adds distinction-level evaluation beyond AUROC.

It uses the trained Zhang models and the Zhang test set.

It does:

1. **Calibration analysis**
   - Checks whether predicted probabilities match observed outcomes.
   - Produces Brier score and Expected Calibration Error.

2. **Decision Curve Analysis**
   - Checks whether the model has clinical decision value across risk thresholds.
   - Compares model net benefit against "treat all" and "treat none".

3. **Subgroup analysis**
   - Checks model performance by gender.
   - Checks model performance by CKD status.

Main outputs:

```text
outputs/advanced_evaluation/calibration_curves.png
outputs/advanced_evaluation/calibration_metrics.csv
outputs/advanced_evaluation/dca_curves.png
outputs/advanced_evaluation/dca_results.csv
outputs/advanced_evaluation/subgroup_gender.png
outputs/advanced_evaluation/subgroup_gender.csv
outputs/advanced_evaluation/subgroup_ckd.png
outputs/advanced_evaluation/subgroup_ckd.csv
outputs/advanced_evaluation/advanced_evaluation_summary.json
```

Final calibration results:

```text
6m_death:
Brier score = 0.0268
ECE         = 0.0227

28d_death:
Brier score = 0.0164
ECE         = 0.0353
```

Purpose in dissertation:

This supports the Advanced Evaluation section and shows the project goes beyond simple AUROC reporting.

## 5. Internal Testing vs External Validation vs MIMIC-Only

This is the most important conceptual difference.

### Internal Testing

Question:

> How well does the model work on unseen patients from the same Zhang dataset?

Data:

```text
Train: Zhang training split
Test: Zhang held-out test split
```

Script:

```text
03_modelling.py
```

This is the main internal model performance.

### External Validation

Question:

> If the model is trained on Zhang, does it transfer to MIMIC-IV?

Data:

```text
Train: Zhang dataset
Test: MIMIC-IV dataset
```

Script:

```text
08_external_validation_mimic.py
```

This is the true cross-dataset validation.

No retraining happens in this script.

### MIMIC-Only Modelling

Question:

> If we train on MIMIC and test on MIMIC, how predictive is the MIMIC dataset itself?

Data:

```text
Train: MIMIC training split
Test: MIMIC test split
```

Script:

```text
09_mimic_only_xgboost.py
```

This is not the main model. It is a comparison experiment.

## 6. Why External Validation Is Lower

The Zhang-trained model performs worse on MIMIC-IV because the two datasets are different.

Possible reasons:

- Different countries and healthcare systems.
- Different hospital coding practices.
- Different lab measurement patterns.
- Different missingness structure.
- Different patient demographics.
- Some Zhang features are not available in MIMIC.
- MIMIC variables are mapped approximately to Zhang features, not perfectly.

This is called **dataset shift** or **limited model transportability**.

This should be discussed as a major finding, not hidden as a failure.

## 7. How To Run Locally

Install requirements:

```bash
pip install -r requirements.txt
```

Run scripts:

```bash
python 01_eda.py
python 02_preprocessing.py
python 03_modelling.py
python 04_survival.py
python 05_shap.py
python 08_external_validation_mimic.py
python 09_mimic_only_xgboost.py
python 10_advanced_evaluation.py
```

On Windows local runs, if multiprocessing causes permission issues, set `n_jobs=1` in `03_modelling.py` and `04_survival.py`.

## 8. How To Run On Colab From VS Code

Use:

```text
run_hf_risk_colab.ipynb
```

The notebook:

- confirms the runtime is Colab/Linux
- unzips the project bundle if needed
- installs requirements
- changes `n_jobs=1` back to `n_jobs=-1` for Colab speed
- runs the final pipeline
- verifies key outputs

Important:

The normal VS Code PowerShell terminal uses your laptop. Only cells inside the Colab-connected notebook use Colab resources.

## 9. Key Dissertation Story

The final story should be:

1. A machine learning pipeline was developed to predict heart failure outcomes from discharge-time clinical data.
2. Early high results were audited for leakage and proxy variables.
3. Strict leakage removal reduced internal AUROC but made the results methodologically defensible.
4. SHAP showed clinically plausible predictors such as GCS, CKD, cardiac structure/function measures, liver disease, and BNP.
5. External validation on MIMIC-IV showed reduced performance, demonstrating dataset shift and limited transportability.
6. Advanced evaluation added calibration, decision curve analysis, and subgroup analysis, going beyond AUROC.

This is stronger than simply reporting the highest possible AUROC, because it shows methodological maturity.
