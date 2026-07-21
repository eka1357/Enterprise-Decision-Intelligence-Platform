---
trigger: always_on
---

# AGENTS.md

# Enterprise Decision Intelligence Platform (EDIP)

Version: 1.0

---

# Mission

Build an enterprise-grade Decision Intelligence Platform that combines Data Engineering, Data Analytics, Machine Learning, Explainable AI, and Business Intelligence into a single production-quality application.

The project must look like a real SaaS product rather than a student project.

Every feature must solve a genuine business problem.

Never build features only for demonstration purposes.

---

# Development Philosophy

Always prioritize

1. Production Quality
2. Clean Architecture
3. Scalability
4. Simplicity
5. Performance
6. Security
7. Maintainability

Every commit should improve the product.

Avoid temporary code.

Avoid placeholder implementations.

Avoid fake analytics.

Avoid mock business logic unless explicitly required.

---

# Core Principle

Every screen must answer one business question.

Examples

Why did revenue decrease?

Which customers will churn?

Which products should be restocked?

What will next month's sales be?

Which region needs attention?

Never build visualizations without business value.

---

# Project Goal

Create a platform where a business uploads data and immediately receives

• Automated cleaning

• Data profiling

• KPI generation

• Executive dashboards

• Machine learning predictions

• Forecasts

• AI insights

• Executive reports

---

# Technology Stack

Backend

Python

FastAPI

PostgreSQL

DuckDB

Redis

Celery

Frontend

React

TypeScript

Tailwind CSS

Shadcn UI

React Query

Charts

Plotly

ECharts

Data Science

Pandas

Polars

Scikit-learn

XGBoost

LightGBM

Prophet

SHAP

Data Validation

Pandera

Great Expectations

Deployment

Docker

GitHub Actions

NGINX

Testing

Pytest

Playwright

Vitest

---

# Folder Structure

backend/

frontend/

ml/

etl/

analytics/

reports/

dashboards/

models/

datasets/

tests/

docs/

docker/

scripts/

.github/

README.md

CHANGELOG.md

LICENSE

---

# Coding Standards

Always

Use type hints

Use docstrings

Write modular code

Write reusable utilities

Use dependency injection

Use environment variables

Write tests

Write logging

Handle exceptions

Never

Hardcode credentials

Hardcode paths

Duplicate code

Ignore lint errors

Leave TODOs

Use print()

Commit broken code

---

# Architecture

Presentation Layer

↓

API Layer

↓

Business Logic

↓

Analytics Layer

↓

Machine Learning Layer

↓

Data Layer

↓

Storage

Every layer must remain independent.

---

# Data Pipeline

Upload

↓

Validation

↓

Cleaning

↓

Transformation

↓

Feature Engineering

↓

Storage

↓

Analytics

↓

Machine Learning

↓

Dashboard

↓

Reports

Every step should be reproducible.

---

# Analytics Requirements

Must support

Sales

Marketing

Finance

Operations

Inventory

Customer

HR

Procurement

Every module should have

KPIs

Trends

Insights

Filters

Drill-down

Exports

---

# Machine Learning Modules

Demand Forecasting

Sales Forecasting

Customer Churn

Customer Lifetime Value

Fraud Detection

Customer Segmentation

Anomaly Detection

Recommendation Engine

Every model must include

Training

Evaluation

Cross Validation

Feature Importance

Explainability

Prediction API

Versioning

---

# Explainable AI

Every prediction must explain

Why

How

Confidence

Feature importance

Recommendations

Use SHAP whenever possible.

No black-box predictions.

---

# Dashboard Rules

No chart without purpose.

Every chart answers one question.

Every KPI must include

Current Value

Previous Value

Percentage Change

Business Meaning

Interactive dashboards only.

---

# AI Assistant

The assistant must answer

Explain this chart

Why did sales fall?

Forecast next month

Generate SQL

Summarize this dashboard

Generate executive report

Recommend actions

Never hallucinate.

Only answer using available data.

---

# Data Quality

Automatically detect

Missing values

Duplicates

Invalid values

Outliers

Schema changes

Column drift

Generate quality score.

Generate quality report.

---

# Reports

Generate

PDF

Excel

CSV

Executive Summary

PowerPoint-ready summary

Every report should contain

Overview

KPIs

Charts

Insights

Recommendations

---

# API Standards

RESTful

Consistent naming

Pagination

Filtering

Sorting

Versioning

Rate limiting

Validation

Swagger documentation

---

# Database Standards

Use migrations.

Normalize appropriately.

Create indexes.

Use foreign keys.

Never duplicate data.

Use UTC timestamps.

---

# UI Standards

Responsive

Fast

Accessible

Keyboard navigation

Dark mode

Light mode

Loading skeletons

Meaningful empty states

Error recovery

Professional animations

---

# Performance Targets

Dashboard

<2 seconds

API

<300ms average

Queries

Optimized

No unnecessary renders

Lazy loading

Caching

Background jobs

---

# Security

JWT Authentication

Role-based access

Input validation

SQL injection prevention

XSS prevention

CSRF protection

Rate limiting

Secrets in environment variables

HTTPS ready

---

# Git Rules

Commit after every meaningful feature.

Commit messages

feat:

fix:

docs:

refactor:

test:

perf:

ci:

Never commit generated files.

---

# Documentation

Every feature requires

Documentation

Screenshots

Architecture update

API documentation

README update

---

# Testing

Backend

>90% coverage

Frontend

Critical paths tested

Machine learning

Evaluation reports

Integration tests

End-to-end tests

---

# CI/CD

Every push

Lint

Format

Tests

Security scan

Build Docker

Deploy Preview

Never merge failing builds.

---

# Code Review Checklist

Readable

Reusable

Documented

Tested

Secure

Performant

Business value

No duplication

Production ready

---

# README Requirements

Project overview

Architecture

Features

Screenshots

Installation

Dataset

Tech stack

ML models

API docs

Roadmap

Demo GIF

Deployment

License

---

# Definition of Done

A feature is complete only if

Works correctly

Tested

Documented

Responsive

Accessible

Secure

Fast

Integrated

Reviewed

Production ready

---

# Ultimate Goal

This repository should resemble the internal analytics platform of a Fortune 500 company rather than a tutorial project.

Every decision should maximize long-term maintainability, realism, and portfolio value.