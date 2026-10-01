<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Enterprise Technical Documentation Style Guide & Standards</h1>
  <p><b>Hyper-scaler documentation principles, tri-lingual parity (EN, TH, ZH-CN), link discipline, GitHub alert conventions, and automated quality gates</b></p>
  <p>
    <a href="DOCUMENTATION_STYLE_GUIDE.md">English</a> |
    <a href="../th/docs/DOCUMENTATION_STYLE_GUIDE.md">ไทย</a> |
    <a href="../zh-CN/docs/DOCUMENTATION_STYLE_GUIDE.md">简体中文</a>
  </p>
</div>

---

## 1. Core Principles & The "Auto-Clarity" Rule

All technical documentation across the IMS repository follows industry-leading hyper-scaler engineering standards (Google SRE, AWS Architecture, Stripe API docs). Documentation exists to empower operators, systems architects, and automation agents to understand, operate, and troubleshoot the platform with zero ambiguity.

### The "Auto-Clarity" Rule

- **Eliminate Fluff**: Drop conversational filler words (`basically`, `simply`, `just`, `obviously`, `really`). State technical facts directly.
- **Active Voice**: Write instructions with clear subjects and direct verbs.
  - ❌ *Passive*: "The telemetry payload is processed by the Node-RED function and stored into the database."
  - ✅ *Active*: "Node-RED validates the telemetry payload and inserts it into TimescaleDB."
- **Code-First Architecture**: Accompany conceptual explanations with executable examples (cURL requests, SQL queries, CLI commands, PromQL expressions).

---

## 2. Tri-Lingual Documentation Parity (EN, TH, ZH-CN)

IMS maintains equal, 1:1 parity across three languages to support multinational engineering and manufacturing floor operations:

```
c:\Projects\IMS
├── docs/               # English canonical documentation (Source of Truth)
├── th/docs/            # Thai localized documentation
└── zh-CN/docs/         # Simplified Chinese localized documentation
```

### Tri-Lingual Maintenance Rules

1. **Synchronous Updates**: Any document created or modified in `docs/` **must** be updated simultaneously in `th/docs/` and `zh-CN/docs/`.
2. **Standardized Header**: Every Markdown document must start with the `GLOBAL_NAV` block and a centered language switcher:
   ```html
   <!-- GLOBAL_NAV -->
   <div align="right">
     <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
     <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
   </div>
   <br/>
   <div align="center">
     <h1>Title</h1>
     <p><b>Subtitle</b></p>
     <p>
       <a href="FILE.md">English</a> |
       <a href="../../th/docs/.../FILE.md">ไทย</a> |
       <a href="../../zh-CN/docs/.../FILE.md">简体中文</a>
     </p>
   </div>
   ```
3. **Anchor & Slug Consistency**: Keep internal header anchor slugs predictable. When referencing headings from other documents, link using standard GitHub Markdown anchor slug formatting.

---

## 3. GitHub Alerts & Semantic Callouts

Use GitHub-flavored markdown alerts to visually highlight operational boundaries, hazards, and recommendations:

> [!NOTE]
> Background context, architecture rationale, or additional reference materials that provide helpful depth without interrupting the operational flow.

> [!TIP]
> Performance optimizations, efficient workflow shortcuts, and recommended practices that improve reliability or developer productivity.

> [!IMPORTANT]
> Essential prerequisites, mandatory configuration parameters, and architectural rules that must never be bypassed.

> [!WARNING]
> High-risk operations, potential data loss scenarios, container service disruptions, or breaking configuration changes.

> [!CAUTION]
> Irreversible actions, database drop operations, secret exposure hazards, or operations that violate production safety rules.

---

## 4. Header Nesting & Typography Discipline

- **Maximum Depth**: Do not nest deeper than H3 (`###`). If deeper categorization is needed, use bold subheaders (`**Sub-step Name**`) or numbered lists.
- **Title Case for Major Headings**: Capitalize primary words in H1 and H2 (`## 3. Container Base Image Governance`).
- **File & Path References**: Always wrap paths, file names, environment variables, commands, and SQL tables in backticks (e.g., `public.ldi_data`, `docker-compose.yaml`, `TIMESTAMPTZ`).
- **Mathematical Equations**: Format mathematical formulas with KaTeX notation:
  - Inline: `$\text{SLI} = \frac{A}{B} \times 100\%$`
  - Display block:
    $$\text{Burn Rate} = \frac{\text{Budget Consumed (\%)}}{\text{Window Duration / 30 Days}}$$

---

## 5. Visual Architecture Diagrams (Mermaid)

Technical architectures, sequence lifecycles, and data state transitions must be visualized using Mermaid diagrams embedded directly in Markdown:

- **Supported Chart Types**: `flowchart TD`, `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`.
- **Label Quoting**: Always quote node labels containing special characters, brackets, or ports:
  `A["PgBouncer (:5432)"] --> B[("TimescaleDB (public)")]`
- **Standalone `.mermaid` Files**: For system-wide architecture overviews, maintain a matching raw `.mermaid` definition in `docs/architecture/` (e.g., `ims-system-architecture.mermaid`) for external rendering in automated CI pipelines.

---

## 6. Code Block Conventions

Every code block must declare its exact syntax highlighting identifier:

- **SQL Blocks** (`sql`): Must use the `public` schema explicitly (ironclad architectural rule: no `ims.*`).
  ```sql
  SELECT bucket AS "time", machine_id, ROUND(avg_temp::numeric, 2)
  FROM public.ldi_data_15m
  WHERE bucket > NOW() - INTERVAL '24 hours';
  ```
- **Bash Blocks** (`bash`): Must be multi-line readable with `\` line continuations and include output piping via `jq` or formatted CLI output where applicable.
- **JSON Blocks** (`json`): Must be valid RFC 8259 JSON without trailing commas.

---

## 7. Verification & Automated Quality Gates

Before any documentation update is committed or pushed to `main`, it must pass the comprehensive automated verification suite:

```bash
# 1. Verify link integrity and anchor resolution across all 690+ markdown files
node scripts/find-broken-links.js

# 2. Run documentation overclaim and phrase verification linter
node tests/lint/doc-overclaim-linter.js

# 3. Scan for accidental private data, IP leaks, or secret leaks
node tests/lint/private-data-leak-scanner.js

# 4. Run full pre-commit validation battery (53 checks)
node scripts/pre-commit.js
```
