'use strict';
/**
 * The one visual standard for every Mermaid diagram in the docs.
 *
 * GitHub renders Mermaid on a white page (light mode) or #0d1117 (dark mode)
 * and does not tell the diagram which. So:
 *   - nodes are solid, mid-dark fills with white text: readable on both pages;
 *   - clusters are transparent with a slate border, titles in slate-500;
 *   - lines, edge text and sequence messages are slate-500, which keeps
 *     >= 3:1 contrast on white and on GitHub's dark background;
 *   - edge labels sit on a light pill with dark text, so they stay legible
 *     where they cross a line.
 *
 * Meaning is carried by the node class (see CLASS_DEFS), never by colour
 * alone: every diagram that uses classes also draws a legend.
 *
 * tests/lint/mermaid-lint.js requires every block to start with INIT and to
 * declare accTitle + accDescr; scripts/generate-docs-readme-index.js emits
 * the same INIT for the directory maps.
 */

// Layout: tight spacing and label wrapping keep diagrams near GitHub's
// ~1,000 px content width; sequence messages wrap instead of widening the page.
const INIT = '%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%';

// Semantic node classes. Fill/text pairs meet WCAG AA (>= 4.5:1) for 14px text.
const CLASSES = {
  actor: { fill: '#475569', stroke: '#1e293b', label: 'Person / external actor' },
  ext: { fill: '#57534e', stroke: '#292524', label: 'External system' },
  ingress: { fill: '#1d4ed8', stroke: '#1e3a8a', label: 'Ingress / gateway' },
  app: { fill: '#0f766e', stroke: '#134e4a', label: 'IMS service' },
  flow: { fill: '#0e7490', stroke: '#164e63', label: 'Node-RED flow / component' },
  store: { fill: '#b45309', stroke: '#78350f', label: 'Data store' },
  viz: { fill: '#4338ca', stroke: '#312e81', label: 'Grafana / UI' },
  obs: { fill: '#6d28d9', stroke: '#4c1d95', label: 'Monitoring' },
  notify: { fill: '#b91c1c', stroke: '#7f1d1d', label: 'Notification channel' },
  future: { fill: '#f8fafc', stroke: '#94a3b8', color: '#475569', dash: true, label: 'Not built (future)' },
};

const CLASS_DEFS = Object.entries(CLASSES)
  .map(([name, c]) => `  classDef ${name} fill:${c.fill},stroke:${c.stroke},color:${c.color || '#ffffff'},stroke-width:1px${c.dash ? ',stroke-dasharray:4 3' : ''}`)
  .join('\n');

module.exports = { INIT, CLASSES, CLASS_DEFS };
