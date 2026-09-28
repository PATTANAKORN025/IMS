<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 企业级技术文档编写规范与风格指南 (Style Guide)</h1>
  <p><b>超级大厂文档准则、三语言对齐规范 (EN, TH, ZH-CN)、超链接规则、GitHub 警报语法与自动化质量门禁</b></p>
  <p>
    <a href="../../docs/DOCUMENTATION_STYLE_GUIDE.md">English</a> |
    <a href="../../th/docs/DOCUMENTATION_STYLE_GUIDE.md">ไทย</a> |
    <a href="DOCUMENTATION_STYLE_GUIDE.md">简体中文</a>
  </p>
</div>

---

## 1. 核心原则与 "自动清晰" 规则 (Auto-Clarity)

IMS 仓库中的所有技术文档均严格遵循业内超大型企业（Google SRE、AWS Architecture、Stripe API）的高标准文档规范。文档的根本目的在于赋能一线运维工程师、系统架构师及自动化 Agent，使其能够毫无二义性地理解、操作与排错。

### "自动清晰" 规则

- **剔除所有废话**: 严禁使用口语化填充词（如 `基本上`、`简单来说`、`其实`、`很显然`）。直接陈述技术事实。
- **使用主动语态 (Active Voice)**: 编写具有明确主语与动词的操作指令。
  - ❌ *被动语态*: "遥测载荷被 Node-RED 处理后存储至数据库中。"
  - ✅ *主动语态*: "Node-RED 验证遥测载荷并将其写入 TimescaleDB。"
- **代码优先规范 (Code-First Architecture)**: 任何理论或概念阐述必须辅以可直接执行的代码示例（cURL 请求、SQL 查询、CLI 指令、PromQL 表达式）。

---

## 2. 三语言对齐规范 (EN, TH, ZH-CN)

为支持跨国工程技术团队及全球生产现场协同，IMS 在三种语言之间保持 1:1 的完整对齐：

```
c:\Projects\IMS
├── docs/               # 英文权威文档 (唯一事实来源 Source of Truth)
├── th/docs/            # 泰文本地化文档
└── zh-CN/docs/         # 简体中文本地化文档
```

### 多语言维护纪律

1. **强一致性同步更新 (Synchronous Updates)**: 任何在 `docs/` 下创建或修改的文档，**必须** 在同一提交周期内全量同步至 `th/docs/` 与 `zh-CN/docs/`。
2. **标准化文件头**: 每个 Markdown 文档必须以 `GLOBAL_NAV` 导航块与居中的多语言切换栏开始：
   ```html
   <!-- GLOBAL_NAV -->
   <div align="right">
     <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
     <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
   </div>
   <br/>
   <div align="center">
     <h1>标题</h1>
     <p><b>副标题</b></p>
     <p>
       <a href="FILE.md">English</a> |
       <a href="../../th/docs/.../FILE.md">ไทย</a> |
       <a href="../../zh-CN/docs/.../FILE.md">简体中文</a>
     </p>
   </div>
   ```
3. **锚点与 Slug 一致性**: 保持标题 Anchor Slug 的规范与连贯性。跨文件跳转时，遵循 GitHub Markdown 锚点命名规范。

---

## 3. GitHub Alerts 语法与语义提示

合理使用 GitHub 风格的 Markdown 提示块以直观突出运维边界、潜在风险与推荐做法：

> [!NOTE]
> 背景上下文、架构设计取舍或补充参考资料，提供纵深信息而不打断主流操作路径。

> [!TIP]
> 性能调优建议、高效工作流技巧以及提升系统稳定性或研发效率的最佳实践。

> [!IMPORTANT]
> 核心前置依赖、强制性配置参数以及绝对不可逾越的底层架构红线。

> [!WARNING]
> 高风险操作、潜在数据丢失隐患、容器服务中断风险或可能破坏向后兼容性的配置变动。

> [!CAUTION]
> 不可逆操作、数据库销毁指令、机密泄露隐患或违反生产安全合规的行为。

---

## 4. 标题层级与排版规范

- **最大嵌套深度**: 严禁使用深于 H3 (`###`) 的多层级标题。如需更细划分，请采用粗体子标题 (`**步骤名称**`) 或编号列表。
- **专有名词与路径引用**: 所有路径、文件名、环境变量、终端命令以及 SQL 数据库表名必须使用反引号包裹（如 `public.ldi_data`, `docker-compose.yml`, `TIMESTAMPTZ`）。
- **数学公式排版**: 统一采用 KaTeX 语法呈现数学方程式：
  - 行内公式: `$\text{SLI} = \frac{A}{B} \times 100\%$`
  - 独立公式块:
    $$\text{Burn Rate} = \frac{\text{Budget Consumed (\%)}}{\text{Window Duration / 30 Days}}$$

---

## 5. 架构拓扑与流程图规范 (Mermaid)

系统拓扑结构、业务执行序列及数据状态变迁统一采用内嵌 Mermaid 绘制：

- **支持图表类型**: `flowchart TD`, `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`。
- **节点文本转义**: 含有括号、端口号等特殊字符的节点必须加双引号转义：
  `A["PgBouncer (:6432)"] --> B[("TimescaleDB (public)")]`
- **独立 `.mermaid` 文件备份**: 针对系统级大架构图，需在 `docs/architecture/` 同步维护独立的 `.mermaid` 文件（如 `ims-system-architecture.mermaid`），以便 CI 自动渲染。

---

## 6. 代码块编写标准

每个代码块必须显式指定语言语法高亮标识符：

- **SQL 块** (`sql`): 必须显式指定 `public` 模式（铁律红线：严禁使用 `ims.*`）：
  ```sql
  SELECT bucket AS "time", machine_id, ROUND(avg_temp::numeric, 2)
  FROM public.ldi_data_15m
  WHERE bucket > NOW() - INTERVAL '24 hours';
  ```
- **Bash 块** (`bash`): 保持易读性，长命令使用 `\` 换行，必要时使用 `jq` 格式化 JSON 输出。
- **JSON 块** (`json`): 必须是符合 RFC 8259 规范的有效 JSON，严禁尾部多余逗号。

---

## 7. 自动化质检门禁与验证命令

在任何文档合并或推送到 `main` 分支之前，必须通过全量自动化验证流水线：

```bash
# 1. 验证全库 690+ Markdown 文件的超链接与锚点有效性
node tests/lint/check-all-links.js

# 2. 运行文档过度宣称与虚标断言检查器
node tests/lint/doc-overclaim-linter.js

# 3. 扫描是否存在敏感内部 IP、私有凭证或密钥泄露
node tests/lint/private-data-leak-scanner.js

# 4. 执行全量 Pre-commit 验证套件 (53 项全面检查)
node scripts/pre-commit.js
```
