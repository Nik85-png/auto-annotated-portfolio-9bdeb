# CSEW MSc Research-Ready Variable Shortlist (30 Variables)

Dataset: `csew_apr23mar24_nvf.tab`  
Rows: `30,847`  
Columns: `2,839`

This is a practical core shortlist for your Phase 1-4 workflow on victim-offender relationship analysis.

## 1) Core 30 Variables

| Variable | Suggested role |
|---|---|
| `serial` | Respondent/case identifier (row-level key) |
| `year` | Survey year code (coarse) |
| `intyear` | Interview year (better for time trend grouping) |
| `intmon` | Interview month |
| `monthid` | Month index identifier |
| `quarter` | Quarter grouping |
| `gor` | Region (broad geography) |
| `ladsupgp` | Local area grouping |
| `wtm2insr` | Main individual survey weight |
| `c11indivwgt` | Alternative individual weight |
| `victim` | Victimization indicator (broad) |
| `victype` | Victim type class |
| `agegrp` | Age group |
| `sexage` | Combined sex/age grouping |
| `nsethgrp` | Ethnicity grouping |
| `onsdisab` | Disability indicator |
| `genheal2` | General health grouping |
| `tenure1` | Housing tenure |
| `tothhin4` | Household income band |
| `stranger` | Stranger-related victimization indicator |
| `acquain` | Acquaintance-related victimization indicator |
| `seracq` | Serious acquaintance indicator |
| `othacq` | Other acquaintance indicator |
| `hhldacq` | Household acquaintance indicator |
| `persacq` | Personal acquaintance indicator |
| `domestic` | Domestic-related indicator |
| `dom_acq` | Domestic acquaintance indicator |
| `violence` | Violence outcome indicator |
| `robbery` | Robbery outcome indicator |
| `theftper` | Personal theft outcome indicator |

## 2) Mapping to Your MSc Phases

## Phase 1 (Data cleaning and standardization)
- Keep and audit missingness in all 30 variables.
- Build a standardized relationship class from:
  - `stranger`
  - `domestic`
  - `acquain`
  - plus optional detail from `seracq`, `othacq`, `hhldacq`, `persacq`, `dom_acq`
- Keep `wtm2insr` for weighted descriptive results.

## Phase 2 (EDA)
- Relationship type by crime type:
  - relationship: `stranger`, `acquain`, `domestic`, `dom_acq`
  - outcomes: `violence`, `robbery`, `theftper`
- Victim profile by relationship:
  - `agegrp`, `sexage`, `nsethgrp`, `onsdisab`, `genheal2`, `tothhin4`
- Time trend:
  - `intyear`, `intmon`, `quarter` (preferred)

## Phase 3 (Modeling)
- Classification target options:
  - `violence` (binary)
  - `robbery` (binary)
  - `theftper` (binary)
- Predictors:
  - relationship indicators + victim profile + time + region (`gor`)
- Clustering feature blocks:
  - relationship indicators
  - victim demographics
  - deprivation/context proxies (`tothhin4`, `tenure1`, geography)

## Phase 4 (Interpretation and recommendations)
- Produce weighted policy-facing summaries with `wtm2insr`.
- Regional visualization:
  - `gor` and optionally `ladsupgp`
- Priority risk profiles:
  - intersections of relationship class with `sexage`, `agegrp`, disability, income band.

## 3) Optional Extension Variables (if you expand beyond 30)
- Fraud/cyber outcomes: `frd`, `hackua`, `virs`
- Hate crime strands: `hatetot`, `racetot`, `religtot`, `agetot`, `disabtot`
- Broader violence marker: `allassau`
- Burglary/mugging context: `burglar`, `mugging1`

## 4) Practical notes
- This file appears to cover mainly interview years `2023-2024`, not a full 5-6 year panel.
- For trend chapters over 5-6 years, you would need to append earlier CSEW waves with aligned variables.
