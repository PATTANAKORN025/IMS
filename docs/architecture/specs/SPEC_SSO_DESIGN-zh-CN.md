<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 规范 (Spec): Grafana / alarm-api 的 SSO 设计

> 状态：**仅为规范，尚未实现。**在 2026-08-14 Soak Attempt 6/7 冻结期间离线准备。未触碰任何运行时系统来生成此文档。

## 当前状态，本次检查已验证

- Grafana 身份验证仅限本地：`GF_SECURITY_ADMIN_USER` /
  `GF_SECURITY_ADMIN_PASSWORD`（单个管理员帐户），在
  `docker-compose.yaml` 的任何地方都没有设置 `GF_AUTH_GENERIC_OAUTH_*` 或 SAML 环境变量。`GF_AUTH_ANONYMOUS_ENABLED: "false"`（很好 ——
  没有匿名访问）。
- 镜像是 `grafana/grafana:13.1.1` —— **OSS（开源版）**，不是
  `grafana-enterprise`。Grafana 从大约 v10.1 开始在 OSS 中免费支持 SAML（在实施时依赖此信息之前，请先对照 13.1.1 发行说明进行验证 —— 这是基于一般常识说明，本次并未对照此特定版本的文档重新验证）。
  Generic OAuth2/OIDC (`auth.generic_oauth`) 一直是 OSS 的核心功能，与版本无关。
- `alarm-api` 没有自己的登录系统 —— 它信任 `proxy` 服务的 `auth_request` 已经验证过的任何 Grafana 会话（`SECURITY_MODEL.md` 边界 1a）。因此，Grafana 上的 SSO
  “免费”传播到 `alarm-api`，该服务不需要单独的 SSO 集成。
- `GF_SECURITY_COOKIE_SECURE: "false"` —— 对于这个本地/模拟环境没问题，但是**任何生产级 SSO 推出的真正先决条件**：安全 cookie（`Secure` 标志，需要 HTTPS）应该
  在真正的企业身份流经此系统之前开启，而不是事后才想起来。

## 为什么需要 SSO，具体原因

现状：**单个共享管理员帐户，单个所有者**（`OWNERSHIP.md`：
一切皆为 `@PATTANAKORN025`）。报警控制台 (Alarm Console) 的确认 (ack)/解决 (resolve) 按钮（`SPEC_ALARM_ACTOR_IDENTITY.md`）中的 `${__user.login}`
目前始终是该单个帐户的用户名 —— 还没有每个操作员的身份来归因操作。SSO 是 `SPEC_ALARM_ACTOR_IDENTITY.md` 具有意义的先决条件，使其不再仅仅是“是否是管理员帐户” —— 借助来自 IdP 的真实每用户身份，`acknowledged_by`/`resolved_by` 成为真实姓名，而不是共享凭据的名称。

## 设计：通过 Grafana 内置的 `auth.generic_oauth` 实现通用 OIDC

特别针对此代码库，推荐使用它而不是 SAML：OIDC 的搭建更简单（比 SAML 的 XML 元数据交换更少的活动部件），几乎可以与所有现代 IdP（Azure AD/Entra ID、Okta、Google Workspace、Keycloak、Authentik —— 任何兼容 OIDC 的产品）配合使用，并且是一个核心 OSS 功能，无需先解决版本歧义问题。

```yaml
# docker-compose.yaml，grafana 服务环境（附加，而不是
# 替换现有的本地管理员帐户 —— 见推出计划）
GF_AUTH_GENERIC_OAUTH_ENABLED: "true"
GF_AUTH_GENERIC_OAUTH_NAME: "Company SSO"
GF_AUTH_GENERIC_OAUTH_CLIENT_ID: ${SSO_CLIENT_ID:?set SSO_CLIENT_ID in .env}
GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET: ${SSO_CLIENT_SECRET:?set SSO_CLIENT_SECRET in .env}
GF_AUTH_GENERIC_OAUTH_SCOPES: "openid profile email"
GF_AUTH_GENERIC_OAUTH_AUTH_URL: ${SSO_AUTH_URL:?set SSO_AUTH_URL in .env}
GF_AUTH_GENERIC_OAUTH_TOKEN_URL: ${SSO_TOKEN_URL:?set SSO_TOKEN_URL in .env}
GF_AUTH_GENERIC_OAUTH_API_URL: ${SSO_API_URL:?set SSO_API_URL in .env}
GF_AUTH_GENERIC_OAUTH_ALLOWED_DOMAINS: ${SSO_ALLOWED_DOMAINS:-}
GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH: "contains(groups[*], 'ims-admins') && 'Admin' || 'Viewer'"
```

真实、不可猜测的值（`SSO_CLIENT_ID` 等）完全取决于实际选择了哪个 IdP —— 本规范故意不发明特定提供商的配置，因为那是超出此代码库范围的组织决策，而不是工程决策。

**角色映射 (Role mapping)**（上面的 `ROLE_ATTRIBUTE_PATH`）是实施前需要做出真正决策的唯一部分：哪个 IdP 组/声明映射到 Grafana 的 `Admin`、`Editor` 和 `Viewer`。占位符（`ims-admins` 组）仅显示形状，并非建议使用该字面上的组名。

## 推出计划（分阶段，非一次性切换）

1. **在现有本地管理员帐户旁边添加 OIDC，暂时不要将其删除。**`GF_AUTH_DISABLE_LOGIN_FORM` 最初保持为 `false`（或未设置） —— 如果无法访问 IdP，本地管理员仍然是打破玻璃（break-glass）的备用方案。如果在推出中途因为 OIDC 配置错误而失去了唯一有效的登录方式，那将是自找的停机。
2. 与单个真实 IdP 帐户进行端到端测试：登录正确重定向，创建 Grafana 会话，`/alarm-api/` 的 `auth_request` 仍然通过（它不在乎 Grafana 会话是_如何_建立的，只在乎存在一个会话 —— 在 proxy/alarm-api 侧应该不需要任何更改）。
3. 确认报警控制台按钮中的 `${__user.login}` 现在反映的是真实的 IdP 身份（例如电子邮件或企业用户名），而不是共享的管理员帐户 —— 这是实际的回报，明确验证它，而不是假设仅 OIDC 登录就能保证它。
4. 只有在确认步骤 3 对至少一个真实用户有效后，才决定是否禁用本地登录表单（`GF_AUTH_DISABLE_LOGIN_FORM: "true"`）并仅限 SSO 登录。这是一个组织层面的决策（所有真正的操作员都已经在 IdP 上了吗？），而不是工程层面的决策 —— 不要把它作为“完成 SSO 功能”的一部分单方面做出决定。

## 测试计划

- 仅配置模拟运行 (Dry run)：由于这需要真实 IdP 的客户端凭据来进行端到端测试，因此如果不先选择真实（或沙盒）IdP，就无法验证实际的 OIDC 握手 —— 这是将规范转化为实施的真正障碍，而不是工程努力。
- 选择 IdP 后：单真实用户登录测试（上述步骤 2/3），然后进行第二次测试，确认本地管理员备用方案仍然有效（没有被新配置意外锁定）。
- 回归测试：`/alarm-api/` 的 ack/resolve 仍然可以通过经 SSO 身份验证的会话进行端到端工作 —— 与 `SPEC_ALARM_ACTOR_IDENTITY.md` 相同的回归标准，因为这两个规范是叠加的（SSO 提供真实身份，角色身份验证使该身份在写入层值得信任）。

## 明确超出本规范范围的内容

- 选择特定的 IdP —— 这是组织决策，不在这里做。
- SAML 作为 OIDC 的替代方案 —— 上面为了简单起见推荐了 OIDC；如果特定的 IdP 需要，在这个 Grafana 版本上 SAML 仍然是可行的，但这没有在这里设计，因为目前没有任何迹象表明有此要求。
- 基础的 Admin/Editor/Viewer 角色映射之外的多租户 / 每团队仪表板权限 —— 该代码库目前明确为单一所有者（`OWNERSHIP.md`），现在设计细粒度的基于团队的访问控制将是解决一个尚未存在的问题。
