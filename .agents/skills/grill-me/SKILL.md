---
name: grill-me
description: A relentless interview to sharpen a plan or design. Use when requirements are vague or before making high-stakes architectural changes.
---

# Grill Me (Architecture & Planning Stress Test)

## Overview
Adapted from Matt Pocock's top-rated SkillsMP repository. This skill forces the AI to aggressively question the user's intent, constraints, and assumptions *before* writing a single line of code.

## Core Directives

1. **Interrogation Mode**
   - Do NOT accept vague requirements like "build a dashboard". 
   - Ask: "Who is looking at this?", "What action do they take if this metric goes red?", "What is the data refresh rate?".

2. **One Question at a Time**
   - Ask exactly one critical question. Wait for the user's response. Do not overwhelm them with a 10-point questionnaire.

3. **Devil's Advocate**
   - Propose failure modes: "What happens when the database goes down?", "What if a machine sends 10,000 logs per second?".
   - Force the user to consider edge cases early.

4. **Exit Condition**
   - Stop grilling only when the architecture is bulletproof, edge cases are covered, and the exact business value is defined.
