---
name: timescaledb-query-optimization
description: Advanced PostgreSQL and TimescaleDB query optimization. Use when writing SQL for Grafana dashboards, building Continuous Aggregates (CAGGs), or debugging slow telemetry queries.
---

# TimescaleDB Query Optimization

## Overview
This skill imports world-class database performance practices (inspired by top GitHub repos on SkillsMP) for our TimescaleDB telemetry backend.

## Core Directives

1. **Continuous Aggregates (CAGGs) First**
   - Raw tables (`ims_telemetry`) should only be queried for the last 1-6 hours of data.
   - For trends > 24 hours, you MUST route queries to the appropriate CAGG.

2. **Time-Bucket Aliasing**
   - Grafana requires the time column to be aliased as `time`.
   - In CAGGs, the column is named `bucket`. 
   - Standard query pattern: `SELECT bucket AS "time", ...`

3. **Data Type Casting**
   - PostgreSQL `ROUND()` requires numeric types. Always cast floats: `ROUND(value::NUMERIC, 2)`.
   - Never interpolate Grafana variables as raw strings. Use `${variable:singlequote}` for strings and `${variable:sqlstring}` for general text inputs to prevent injection attacks.

4. **Query Budget**
   - Grafana panels must return data in under 500ms. 
   - Use `EXPLAIN ANALYZE` if a query feels slow. Ensure it is hitting the chunks index on the `time` column.
