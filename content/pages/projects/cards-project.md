---
type: ProjectLayout
title: Interactive Card Sorting Task - Spatial Organization and Cognitive Strategy Analysis
metaTitle: Card Sorting Task - Spatial Organization and Cognitive Strategy Analysis
metaDescription: Behavioural movement analysis across 229 trials examining organization, strategy, blank-card usage, and success outcomes.
socialImage: /images/featured-Image6.jpg
colors: colors-a
date: '2026-02-15'
client: London Metropolitan University
description: >-
  A behavioural data project investigating how spatial organization and strategy
  quality influence success in interactive card arrangement tasks.
featuredImage:
  type: ImageBlock
  url: /images/featured-Image6.jpg
  altText: Card sorting behavioural analysis project
media:
  type: ImageBlock
  url: /images/featured-Image6.jpg
  altText: Interactive card sorting analysis
---

## Project Overview

This project investigates how people organize information spatially and the cognitive strategies they employ when solving card arrangement tasks.

Participants used an interactive 8x8 grid to arrange playing cards (Kings, Queens, Jacks, and in some conditions, blank cards), while every movement was tracked.

Core question: what separates successful problem-solvers from those who struggle?

[Open the interactive analysis explorer in a new page](/cards-analysis/index.html)

## Live Interactive Viewer

<iframe
  src="/cards-analysis/index.html?embed=1"
  title="Interactive Card Sorting Analysis"
  data-cards-embed="1"
  data-cards-embed-fallback="local"
  style="width:100%;min-height:620px;border:0;border-radius:12px;background:transparent;"
  loading="lazy"
></iframe>

## What We Measured

We analyzed **229 trials** across four task conditions:

| Condition | Description | Trials |
| --- | --- | --- |
| KQ | King and Queen only | 56 |
| KQB | King, Queen, and Blank | 62 |
| KQJ | King, Queen, and Jack | 52 |
| KQJB | King, Queen, Jack, and Blank | 59 |

For each trial we captured:

- Every card placement (position and sequence)
- Total moves
- Spatial organization pattern
- Success or failure outcome
- Strategic tool usage (blank cards)

## Key Findings

### 1) Organization Matters More Than Effort

- Successful trials: average messiness deterioration = **+0.21 per move**
- Failed trials: average messiness deterioration = **+0.34 per move**
- Failures showed a **63% faster organizational decline** *(p = 0.0085)*

Interpretation: success was not about trying harder, it was about staying systematic as complexity increased.

### 2) Blank Card Advantage

When blank cards were available (KQB, KQJB), using them improved outcomes substantially:

- **KQB with blank card:** 81.1% success (30/37)
- **KQB without blank card:** 52.0% success (13/25)
- **KQJB with blank card:** 60.9% success (14/23)
- **KQJB without blank card:** 25.0% success (9/36)

Overall uplift: **+29% to +36%** in success rates *(chi-square test, p < 0.01)*.

### 3) Learning and Adaptation

Only **14%** of participants who failed initially recovered on later attempts.

Interpretation: early strategy selection was critical, and self-correction after failure was uncommon.

### 4) Messiness as a Predictor

Messiness score:

`messiness = (1/n) * SUM( sqrt((x_i - x_bar)^2 + (y_i - y_bar)^2) )`

- Clean trials *(messiness < 2.0)*: **68%** success
- Messy trials *(messiness > 3.5)*: **18%** success

Spatial organization was a strong predictor of performance.

## My Contribution

### Interactive Visualizations

- Built animated card-movement viewer with playback controls
- Built grid-based visualization showing arrangement evolution by move
- Added filter-based exploration (participant, condition, outcome)
- Added move-level highlighting and trial detail panels

### Quantitative Analysis

- Calculated messiness scores for all trials
- Compared success and failure groups statistically
- Analyzed learning trajectories and adaptation behaviour
- Measured blank-card impact on outcomes
- Produced comparative visuals of behavioural strategies

## How to Use the Interactive Tools

Use the explorer to:

1. Select trials by condition/outcome
2. Watch move-by-move placement animations
3. Compare successful vs failed strategies
4. Filter by blank-card usage
5. Explore repeated attempts by participant

Legend:

- Gold highlight = latest move
- Grid coordinates = exact 0-7 positions
- Move counter = step progression
- Trial panel = outcome and messiness metadata

## Statistical Notes

- Sample: **N = 229 trials**
- Overall success rate: **46.7%** (107/229)

Key tests:

- Messiness deterioration: **t(227) = 2.67, p = 0.0085**
- Blank card effect: **chi-square, p < 0.01**
- Organization categories: **F(2,226) = 42.1, p < 0.001**

Effect sizes:

- Messiness on success: **Cohen's d = 1.24** (large)
- Blank-card usage: **Cramer's V = 0.38** (medium-large)

## Practical Implications

Findings indicate that successful problem-solving in spatial tasks depends more on sustained organization than on effort alone.

This suggests:

- Training should emphasize organizational strategy, not just repetition
- Flexible tools (like blank cards) can materially improve outcomes
- Early intervention matters because strategy recovery is rare
- Messiness can act as an early warning signal of struggle

## Data and Code

- Interactive page: `/cards-analysis/index.html`
- JSON data source: `public/data/card_analysis_data.json`
- Optional animation asset path (if you add MP4 later): `public/videos/cards-animation.mp4`

Next step: integrate your Colab notebook outputs into this page (model metrics, additional graphs, and detailed method notes).
