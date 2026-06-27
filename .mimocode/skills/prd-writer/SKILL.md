---
name: prd-writer
description: Write Product Requirements Documents (PRDs) that clearly define features, user stories, and success criteria
---

# PRD Writer

Create comprehensive Product Requirements Documents that guide development teams.

## When to Use

- Planning new features or products
- Documenting requirements before implementation
- Communicating scope to stakeholders
- Creating reference documents for development

## PRD Structure

### 1. Overview

```markdown
## Overview
- **Product Name**: [Name]
- **Version**: [Version]
- **Date**: [Date]
- **Author**: [Author]
```

### 2. Problem Statement

Define the problem clearly:
- Who is affected?
- What is the current pain point?
- Why is this important to solve?

### 3. Goals and Objectives

```markdown
## Goals
- [Goal 1]: Measurable outcome
- [Goal 2]: Measurable outcome

## Non-Goals
- [What we're explicitly NOT doing]
```

### 4. User Stories

```markdown
## User Stories

### Story 1: [Title]
**As a** [user type]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
```

### 5. Requirements

#### Functional Requirements

```markdown
## Functional Requirements

### Feature: [Feature Name]
- **Description**: What it does
- **Priority**: P0/P1/P2
- **Dependencies**: [Other features]
```

#### Non-Functional Requirements

```markdown
## Non-Functional Requirements

### Performance
- Page load time: < 2 seconds
- API response time: < 200ms

### Security
- Authentication required for all endpoints
- Data encryption at rest and in transit

### Scalability
- Support 10,000 concurrent users
- Handle 1M+ records efficiently
```

### 6. Design Specifications

- Wireframes or mockups
- Component hierarchy
- Data models
- API contracts

### 7. Success Metrics

```markdown
## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| User engagement | 30% | 50% | Analytics |
| Task completion | 70% | 90% | User testing |
```

### 8. Timeline

```markdown
## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Design | 1 week | Mockups approved |
| Development | 2 weeks | Feature complete |
| Testing | 1 week | QA passed |
| Launch | 1 day | Deployed |
```

### 9. Open Questions

```markdown
## Open Questions

- [ ] Question 1?
- [ ] Question 2?
```

## Best Practices

1. **Be specific**: Avoid vague language like "should be fast"
2. **Include examples**: Show, don't just tell
3. **Prioritize**: Not everything is P0
4. **Get feedback**: Share with stakeholders early
5. **Keep it updated**: PRD is a living document
