---
name: skill-creator
description: Create new skills, modify and improve existing skills. Use when users want to create a skill from scratch, edit, or optimize an existing skill's description for better triggering accuracy.
---

# Skill Creator (Meta-Skill)

## Overview
Adapted from Anthropic's official SkillsMP repository. This is a meta-skill that allows the AI to autonomously generate, refine, and deploy *new* skills into the `.agents/skills/` directory.

## Core Directives

1. **Standardized Structure**
   - All generated skills MUST have valid YAML frontmatter containing `name` and `description`.
   - The body MUST be valid Markdown.
   - The file MUST be saved as `.agents/skills/<skill-name>/SKILL.md`.

2. **Trigger Optimization**
   - The `description` field in the frontmatter determines when the skill is autonomously invoked.
   - Keep it concise but dense with keywords (e.g., "Use when...").

3. **Directive Clarity**
   - Write instructions as strict imperatives ("Do X", "Never do Y").
   - Avoid flowery language. Agents reading the skill need concrete constraints, not philosophies.

4. **Self-Improvement Loop**
   - If a skill repeatedly fails or produces bad code, use `skill-creator` to edit the skill and add explicit preventative constraints based on the post-mortem.
