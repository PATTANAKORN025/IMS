---
name: grafana-dashboard-mastery
description: World-class Grafana UI/UX design and dashboard engineering. Use this when creating or modifying Grafana dashboards for the IMS project. Enforces ISA-101 compliance, Grid-24 layout constraints, and Canonical Color Tokens.
---

# Grafana Dashboard Mastery (Frontend for IMS)

## Overview
In the IMS system, Grafana *is* our Frontend. This skill enforces world-class UI/UX design principles specifically adapted for industrial monitoring dashboards. It merges Anthropic's intentional visual design principles with ISA-101 industrial standards.

## Core Directives

1. **Grid-24 Discipline (Layout Strictness)**
   - Every dashboard row must sum to exactly 24 columns (`w: 24`).
   - Sizing must be intentional. Never leave floating panels.
   - Next Y position = Previous Y + Previous H.
   - For kiosk displays (e.g., `ims-ldi-operator-andon`), enforce zero-scroll constraints. Maximum height budget is 20 grid units.

2. **Canonical Color Tokens (Design System)**
   - Never use default Grafana color palettes.
   - Use our canonical tokens for state mapping:
     - Critical/Error: `#FF003C` (Red)
     - Warning: `#FFB800` (Amber)
     - OK/Healthy: `#00FF87` (Green)
     - Information/Neutral: `#00F2FE` (Cyan)

3. **ISA-101 UI/UX Compliance**
   - Minimize visual noise. Omit gradients, 3D effects, and excessive borders.
   - Use State Timelines and Bar Gauges for quick, glanceable status over raw tables where possible.
   - Actionable hierarchy: Critical alarms at the top left, supporting metrics at the bottom right.

4. **Security & Performance (The Vercel-Standard)**
   - ALL dashboard variables used in PostgreSQL `rawSql` queries MUST use `${var:sqlstring}`. 
   - Never use raw `${var}` (prevents SQL Injection).
