---
name: frontend-design
description: UI/UX design guidance for web applications - layouts, components, accessibility, and responsive design
---

# Frontend Design

Design and implement modern, accessible, and responsive user interfaces.

## When to Use

- Creating new UI components or pages
- Improving existing layouts or user flows
- Implementing responsive designs
- Ensuring accessibility compliance (WCAG 2.1)
- Choosing color palettes, typography, or spacing

## Design Principles

### 1. User-Centered Design

- Start with user needs, not technical constraints
- Keep interfaces simple and intuitive
- Provide clear feedback for user actions
- Maintain consistency across the application

### 2. Responsive Design

- Mobile-first approach: design for smallest screen first
- Use CSS Grid or Flexbox for layouts
- Breakpoints: 320px (mobile), 768px (tablet), 1024px (desktop), 1440px (large)
- Test on real devices when possible

### 3. Accessibility (WCAG 2.1)

- Use semantic HTML elements (`<nav>`, `<main>`, `<article>`, `<aside>`)
- Provide alt text for images
- Ensure sufficient color contrast (4.5:1 for normal text, 3:1 for large text)
- Support keyboard navigation
- Use ARIA labels when needed

### 4. Visual Hierarchy

- Use size, color, and spacing to guide attention
- Primary actions should be visually prominent
- Group related elements together
- Maintain consistent spacing (4px grid system)

## Component Patterns

### Buttons

```css
.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}
```

### Cards

```css
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  padding: 16px;
}
```

### Forms

- Group related fields
- Use clear labels and placeholders
- Provide inline validation
- Show errors near the relevant field

## Color Palette Guidelines

- Primary: Brand color for main actions
- Secondary: Supporting color for less prominent actions
- Neutral: Grays for text, borders, backgrounds
- Semantic: Green (success), Yellow (warning), Red (error), Blue (info)

## Tools

- Use CSS custom properties for theming
- Implement dark mode support with `prefers-color-scheme`
- Use CSS transitions for smooth interactions
- Consider animation for loading states
