# MSc Research Proposal

## Title
**Understanding Victim-Offender Relationship Patterns in England and Wales: A Data-Driven Analysis Using CSEW 2023-2024**

## 1. Background and Rationale
Victim-offender relationships are central to understanding crime risk, harm, and prevention strategy. Policy and policing responses often differ depending on whether incidents involve strangers, acquaintances, or domestic contexts. However, applied analysis is frequently fragmented across offense categories and demographic groups, making it harder to identify actionable risk profiles.

This project uses the Crime Survey for England and Wales (CSEW) extract in `public/data/csew_msc_30vars.csv` to examine how victim-offender relationship indicators vary across victim profiles, crime outcomes, and time/region structure. The work is designed to produce interpretable evidence for prevention and targeted intervention planning.

## 2. Aim
To identify and model patterns in victim-offender relationship types and their association with victim characteristics and crime outcomes.

## 3. Objectives
1. Build a clean analytical dataset focused on victimization, relationship indicators, and key demographics.
2. Quantify prevalence of relationship types (`stranger`, `acquain`, `domestic`, etc.) across victim groups.
3. Evaluate associations between relationship types and crime outcomes (`violence`, `robbery`, `theftper`).
4. Develop predictive and unsupervised models to identify high-risk victim-relationship profiles.
5. Translate findings into policy-relevant recommendations and future data priorities.

## 4. Research Questions
1. Which victim-offender relationship types are most prevalent overall and by victim demographic profile?
2. How do relationship indicators relate to different offense outcomes (especially violence vs robbery vs theft)?
3. Do temporal and regional patterns suggest specific relationship-linked vulnerability contexts?
4. Can relationship and demographic features improve classification of offense outcome risk?

## 5. Dataset and Variables

### Source
- `public/data/csew_msc_30vars.csv`
- Rows: 30,847
- Columns: 30
- Time scope in this extract: mainly interview years 2023-2024

### Core variable blocks
- Time/context: `year`, `intyear`, `intmon`, `monthid`, `quarter`, `gor`, `ladsupgp`
- Weights: `wtm2insr`, `c11indivwgt`
- Victim status/profile: `victim`, `victype`, `agegrp`, `sexage`, `nsethgrp`, `onsdisab`, `genheal2`, `tenure1`, `tothhin4`
- Victim-offender relationship indicators: `stranger`, `acquain`, `seracq`, `othacq`, `hhldacq`, `persacq`, `domestic`, `dom_acq`
- Outcome variables: `violence`, `robbery`, `theftper`

## 6. Identified Gap
1. Most existing practical analyses report victimization prevalence but do not jointly model relationship type + victim profile + offense outcome in one pipeline.
2. Relationship categories are often treated as descriptive endpoints, not predictive features.
3. Few applied studies provide a transparent, reproducible workflow that bridges descriptive insights and model-based risk stratification for this context.
4. This extract is short-horizon (2023-2024), so evidence on longer-term trend stability remains underdeveloped.

## 7. Methodology

## Phase 1: Data Preparation
1. Validate coding and missingness patterns for all 30 variables.
2. Recode relationship indicators into a harmonized relationship class:
   - `stranger`
   - `acquaintance` (from `acquain`, with optional detail `seracq`, `othacq`, `hhldacq`, `persacq`)
   - `domestic` (from `domestic`, `dom_acq`)
   - `other/unknown` where necessary
3. Apply survey weighting (`wtm2insr`) in descriptive estimates.
4. Produce a reproducible data dictionary and cleaning log.

## Phase 2: Exploratory Analysis
1. Weighted prevalence tables of relationship types overall and by:
   - age/sex (`agegrp`, `sexage`)
   - ethnicity (`nsethgrp`)
   - disability (`onsdisab`)
   - socioeconomic proxies (`tenure1`, `tothhin4`)
2. Cross-tab and association analysis for relationship type vs outcomes:
   - `violence`
   - `robbery`
   - `theftper`
3. Time and geography cuts:
   - monthly/quarterly variation (`intmon`, `quarter`)
   - regional variation (`gor`, `ladsupgp`)
4. Visualizations:
   - heatmaps (profile x relationship)
   - weighted bar charts by outcome
   - small-multiple regional trend plots

## Phase 3: Modeling
1. Classification models:
   - Targets: `violence`, `robbery`, `theftper` (binary, separate models)
   - Features: relationship indicators + demographics + context
   - Baselines: logistic regression
   - Nonlinear comparators: random forest / gradient boosting
   - Metrics: AUC, F1, precision-recall, calibration
2. Clustering:
   - Inputs: standardized demographic + relationship features
   - Methods: k-means and hierarchical clustering
   - Output: interpretable victim-relationship profile segments
3. Robustness checks:
   - weighted vs unweighted comparisons
   - subgroup performance checks to avoid hidden bias

## Phase 4: Interpretation and Recommendations
1. Convert model outputs into plain-language risk patterns.
2. Identify high-priority relationship contexts for prevention focus.
3. Provide region-aware and demographic-aware recommendations.
4. Document methodological constraints and external validity limits.

## 8. Expected Contribution
1. A transparent end-to-end analytical framework for victim-offender relationship analysis.
2. Evidence on how relationship context links to offense-type risk.
3. Interpretable profile segments useful for targeted safeguarding policy.
4. A reproducible base pipeline that can be extended to multi-year CSEW waves.

## 9. Ethics and Data Governance
1. Use only anonymized survey data.
2. Avoid any individual re-identification attempts.
3. Report subgroup results responsibly to reduce stigmatization risk.
4. Use fairness checks for model evaluation across protected or vulnerable groups where represented.

## 10. Limitations
1. Time range in this extract is short (mainly 2023-2024), limiting long-horizon trend inference.
2. Relationship indicators are proxies and may not capture full incident context.
3. Some variables may require careful treatment of non-substantive/missing codes.
4. Cross-sectional structure limits strong causal claims.

## 11. Future Work
1. Append earlier CSEW waves to construct a 5-6 year comparable panel for stronger trend analysis.
2. Expand outcomes to include fraud/cyber and hate-crime strands (`frd`, `hackua`, `virs`, `hatetot` family).
3. Build multilevel models (individual + regional context).
4. Add spatial analysis using richer geographic files if available.
5. Explore policy simulation scenarios (targeting specific relationship-risk profiles).

## 12. Proposed Timeline (16 Weeks)
1. Weeks 1-4: Data quality audit, coding harmonization, missingness strategy.
2. Weeks 5-7: EDA, weighted prevalence maps/tables, preliminary interpretation.
3. Weeks 8-13: Modeling, validation, robustness/fairness checks.
4. Weeks 14-16: Write-up, policy translation, limitations and future agenda.

## 13. Deliverables
1. Clean reproducible analysis notebook/scripts.
2. Final dissertation chapter outputs (figures + tables).
3. Technical appendix with variable handling and model diagnostics.
4. Policy-facing summary brief of key findings.
