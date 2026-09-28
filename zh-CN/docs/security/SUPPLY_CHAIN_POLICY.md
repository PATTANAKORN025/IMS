<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 软件供应链与依赖项安全治理策略 (Supply Chain Policy)</h1>
  <p><b>SLSA Level 3 安全框架、CycloneDX SBOM 生成、容器镜像 Digest 哈希锁定、开源许可证合规及漏洞修复 SLA</b></p>
  <p>
    <a href="../../../docs/security/SUPPLY_CHAIN_POLICY.md">English</a> |
    <a href="../../../th/docs/security/SUPPLY_CHAIN_POLICY.md">ไทย</a> |
    <a href="SUPPLY_CHAIN_POLICY.md">简体中文</a>
  </p>
</div>

---

## 1. 治理目标与 SLSA 安全框架

现代工业遥测系统高度依赖容器运行时、开源生态第三方库 (Node.js, Python, Go, Rust) 以及底层基础镜像。上游依赖项投毒或被篡改的基础镜像将对工业制造网络带来严重的供应链安全穿透风险。

IMS 在代码构建与发布全生命周期中全面落地 **Supply-chain Levels for Software Artifacts (SLSA v1.0) Level 3** 安全标准：

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 源代码版本控制   │ ----> │ 瞬态隔离构建环境 │ ----> │ 经签名制品仓库   │
│ 锁定 Git 提交哈希│       │ 隔离 Runner 实例│       │ Cosign / OCI    │
│ 分支安全保护规则 │       │ 生成 SLSA 证明  │       │ 不可变摘要校验   │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

- **源代码完整性 (Source Integrity)**: 所有的代码合并均须通过数字签名 (`GPG` / `SSH`)、多审查者同行审批，并强制通过 pre-commit 本地静态代码检查。
- **构建隔离性 (Build Isolation)**: 容器镜像构建任务均在无持久化存储卷缓存的瞬态 GitHub Actions 隔离 Runner 环境中执行。
- **来源与出处证明 (Provenance & Attestation)**: 发行版构建产物自动生成符合 in-toto 规范的来源溯源记录，并通过 Sigstore `cosign` 完成防伪签名。

---

## 2. 软件物料清单 (SBOM) 生成标准

IMS 强制要求针对每个发布的容器镜像与发布产物，持续生成符合 **CycloneDX v1.5 (JSON)** 与 **SPDX v2.3** 行业标准的机读格式软件物料清单 (SBOM)。

### 通过 CLI 生成 CycloneDX SBOM

开发人员与 CI/CD 自动化管道使用 Anchore `syft` 和 Aqua Security `trivy` 工具对代码及容器依赖项进行清单提取：

```bash
# 1. 提取并生成容器文件系统依赖项的 CycloneDX JSON 格式 SBOM
syft ims-alarm-api:latest -o cyclonedx-json=sbom-alarm-api.cdx.json

# 2. 提取 Node-RED 运行环境所有依赖项的 SBOM
syft dir:./nodered_data -o cyclonedx-json=sbom-nodered.cdx.json

# 3. 使用 jq 审查生成的 SBOM 中的关键组件清单
jq '.components[] | {name: .name, version: .version, type: .type}' sbom-alarm-api.cdx.json | head -n 25
```

---

## 3. 容器基础镜像治理与 Digest 锁定机制 (Pinning)

为防止可变标签污染（Tag Drift，例如使用 `:latest` 导致的非受控镜像漂移或恶意替换），所有面向生产环境的编排配置 (`docker-compose.yml`, `docker-compose.prod.yml`) 均必须显式锁定不可变的 SHA-256 镜像加密 Digest：

```yaml
# 严格锁定镜像摘要的最佳实践
services:
  timescaledb:
    image: timescale/timescaledb-ha:pg16-ts2.15-oss@sha256:69b4e3c98dc65b53eef6a06be38b4b734898165cf9c0daae1540608ebcf2fe56
```

### 官方认可的基础镜像清单

| 核心服务组件 | 基础操作系统发行版 | 准入基础镜像标准 | 安全加固与加固措施 |
|:------------|:-------------------|:-----------------|:-------------------|
| `timescaledb` | Debian Bookworm Slim | 官方发布的带有 Digest 的镜像 | 非 root 用户 `postgres` UID 70，只读根文件系统 |
| `pgbouncer` | Alpine Linux 3.19 | 极简静态二进制产物 | 非 root 用户 `postgres` UID 70，剥离 `CAP_NET_RAW` |
| `node-red` | Alpine Linux 3.19 | Node-RED 官方发行镜像 | 非 root 用户 `node-red` UID 1000，隔离全局沙箱环境 |
| `grafana` | Alpine Linux 3.19 | Grafana Enterprise/OSS 官方镜像 | 非 root 用户 `grafana` UID 472，配置只读预配置挂载 |
| `prometheus` | Alpine / Distroless | Prometheus 官方发布二进制 | 非 root 用户 `nobody` UID 65534，独立隔离 TSDB 卷 |
| `nginx-proxy` | Alpine Linux 3.19 | Nginx Unprivileged 官方镜像 | 非 root 用户 `nginx` UID 101，使用非特权端口 (:8080/:8443) |

---

## 4. 开源许可证合规准则 (License Compliance)

为保护工厂专有生产控制算法及知识产权，防止被传染性开源协议污染，系统对引入的第三方开源依赖项实施严格分级管控：

```
[允许使用的协议清单 - 商业与企业级环境安全]
  ├── MIT License
  ├── Apache License 2.0
  ├── BSD 2-Clause / 3-Clause
  ├── ISC License
  └── Creative Commons Zero (CC0)

[条件允许使用的协议 - 仅限独立隔离的容器微服务中]
  ├── LGPL v2.1 / v3.0 (仅允许动态链接库方式引用)
  └── Mozilla Public License 2.0 (MPL-2.0)

[严禁使用的协议清单 - 具有传染性开源约束 (代码审查直接否决)]
  ├── GNU General Public License v3.0 (GPLv3)
  ├── Affero General Public License (AGPL-3.0)
  └── Server Side Public License (SSPL)
```

### 自动化许可证合规巡检命令

```bash
# 扫描 Node.js 工作区中所有依赖项是否存在非合规开源许可证
npx license-checker --summary --excludePrivatePackages \
  --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC0-1.0;0BSD"
```

---

## 5. 漏洞修复响应 SLA 与 CVSS 评级标准

在容器镜像、应用依赖项及底层系统包中发现的安全漏洞，均须参照 **通用漏洞评分系统 (CVSS v3.1 / v4.0)** 进行定级，并严格执行修复时限：

| 漏洞严重等级 | CVSS 基础评分 | 强制修复响应 SLA | 升级响应与处置流程 |
|:-------------|:--------------|:-----------------|:-------------------|
| **CRITICAL (致命)** | `9.0 - 10.0` | **24 小时内修复** | 启动紧急 Hotfix 分支；立即发布生产热修补；通报 CISO 及工厂生产总监。 |
| **HIGH (高危)** | `7.0 - 8.9` | **7 天内修复** | 安排加急版本发布；安全团队复审；在预发环境完成全量回归测试。 |
| **MEDIUM (中危)** | `4.0 - 6.9` | **30 天内修复** | 纳入常规敏捷迭代周期或月度计划停机维护窗口中修复。 |
| **LOW (低危)** | `0.1 - 3.9` | **90 天内修复** | 结合季度日常依赖版本升级进行统一治理。 |

---

## 6. 自动化安全扫描 CLI 实用命令

安全防线内嵌于日常开发与持续集成流水线中：

```bash
# 1. 扫描当前工作区源码文件，排查硬编码密钥与已知 CVE 漏洞
trivy fs --severity HIGH,CRITICAL --scanners vuln,secret,config .

# 2. 在将构建好的容器镜像推送到镜像仓库前进行镜像漏洞扫描
trivy image --severity HIGH,CRITICAL ims-alarm-api:latest

# 3. 使用 Cosign 校验发布镜像的数字防伪签名
cosign verify \
  --key cosign.pub \
  ghcr.io/pattanakorn025/ims-alarm-api:v2.4.0
```
