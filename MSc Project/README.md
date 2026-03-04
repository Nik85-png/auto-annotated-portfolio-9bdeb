# HF-RISK - MSc Data Analytics Project
Nikunj Prajapati | 24052351 | London Metropolitan University

Predicting heart failure outcomes with machine learning.

## Project Structure

```text
MSc Project/
|-- data/
|   |-- dat.csv
|   `-- mimic_external.csv (optional for external validation)
|-- models/
|   |-- mice_imputer.pkl
|   |-- best_model_*.pkl
|   |-- cox_model.pkl
|   `-- rsf_model.pkl
|-- outputs/
|   |-- eda/
|   |-- preprocessing/
|   |-- modelling/
|   |-- survival/
|   `-- shap/
|-- 01_eda.py
|-- 02_preprocessing.py
|-- 03_modelling.py
|-- 04_survival.py
|-- 05_shap.py
|-- 06_streamlit_tool.py
|-- 07_external_validation.py
`-- requirements.txt
```

## Setup

```bash
pip install -r requirements.txt
```

## Running Order

1. `01_eda.py` - EDA, missingness mapping, outcome inspection, figures.
2. `02_preprocessing.py` - Proposal-aligned preprocessing:
   - drop columns with >80% missing
   - median impute columns with <10% missing
   - MICE impute columns with 10-80% missing
   - feature engineering and train/test split
3. `03_modelling.py` - Train 5 models x 4 outcomes with 5-fold CV.
4. `04_survival.py` - Kaplan-Meier, Cox PH, Random Survival Forest.
5. `05_shap.py` - SHAP global and patient-level explanations.
6. `06_streamlit_tool.py` - Clinician-facing risk prediction prototype.
7. `07_external_validation.py` - Conditional external validation (runs only if `data/mimic_external.csv` exists).

## Notes

- Primary data file is `data/dat.csv` (PhysioNet heart failure cohort).
- External validation is optional and depends on harmonized external data.
- Streamlit tool requires outputs from Steps 2 and 3.
