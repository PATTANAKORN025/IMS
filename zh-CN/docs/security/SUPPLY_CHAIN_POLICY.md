# 软件供应链与依赖策略

本文档定义了 IMS 平台中使用的所有第三方库、基础镜像和插件的安全标准。

## 1. SBOM (软件物料清单)
- IMS 使用 **CycloneDX** 标准生成 SBOM。
- 在 CI/CD 的每次构建中都会自动生成 SBOM。

## 2. 许可证合规性 (License Compliance)
- **允许**: MIT, Apache 2.0, BSD, ISC。
- **严禁**: GPLv3, AGPL (除非通过严格分离的网络 API 隔离)。

## 3. 漏洞管理 (SLA)
- **CRITICAL (严重)**: 24 小时内修复。
- **HIGH (高危)**: 7 天内修复。
- **MEDIUM/LOW (中/低)**: 在每月维护窗口期间审查。
