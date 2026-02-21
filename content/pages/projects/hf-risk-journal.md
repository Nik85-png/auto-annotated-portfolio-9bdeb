---
type: ProjectLayout
title: HF-RISK Live Project Journal
metaTitle: HF-RISK Live Project Journal
metaDescription: Live GitHub-powered MSc project journal for heart failure risk prediction research.
socialImage: /images/featured-Image2.jpg
colors: colors-a
date: '2026-02-21'
client: London Metropolitan University
description: >-
  A live research journal that reads project progress from JSON and publishes updates
  automatically from GitHub.
featuredImage:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK research journal
media:
  type: ImageBlock
  url: /images/featured-Image2.jpg
  altText: HF-RISK research journal
---

## Overview

HF-RISK is a GitHub-powered project journal for documenting the full MSc research lifecycle, including phase progress, literature notes, methods, and findings.

This page reads data directly from a JSON file, so updates can be published by editing one file.

[Open the journal in a new page](/hf-risk/index.html)

## Live Journal

<iframe
  src="/hf-risk/index.html"
  title="HF-RISK Live Journal"
  style="width:100%;min-height:1200px;border:0;border-radius:12px;background:transparent;"
  loading="lazy"
></iframe>

## How Updates Work

1. Edit `project-data.json` in your GitHub repo.
2. Push the change.
3. Open the journal with `?dataUrl=RAW_JSON_URL` if you want it to read directly from GitHub.

Example:

`/hf-risk/index.html?dataUrl=https://raw.githubusercontent.com/USERNAME/REPO/main/project-data.json`

