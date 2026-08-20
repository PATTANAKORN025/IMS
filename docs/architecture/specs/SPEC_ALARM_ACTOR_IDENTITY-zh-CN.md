<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 规范：告警操作者身份验证 (Spec: Alarm Actor-Identity Verification)

> 状态：**仅为规范，尚未实现。** 准备于 2026-08-14 的 Soak Attempt 6 冻结期间离线完成。生成此文档未触及任何运行时系统。

## 问题的确切描述

`services/alarm-api/server.js` 直接从请求体 (request body) 中将 `acknowledged_by`/`resolved_by` 写入 `public.ldi_alarm_lifecycle`。UI（`ims-ldi-alarm-console.json` 中的确认/解决按钮）已经使用 `${__user.login}`（Grafana 自己的当前登录用户模板变量）正确填充了这些内容：

```js
fetch('/alarm-api/alarms/ack', {
 method: 'POST',
 body: JSON.stringify({ logdate_ms: {{When_ms}}, logid: '{{logid}}', acknowledged_by: '${__user.login}' })
})
```

因此在正常使用中，归属信息已经是正确的。这里的漏洞在于：这是一个客户端 JS 字符串，被插值到 fetch 请求体中 —— 在发送请求之前可以在浏览器开发者工具中进行编辑，或者使用任何有效的 Grafana 会话 Cookie 加上任意的 `acknowledged_by` 值，通过 `curl` 轻易复现。服务器无法区分“UI 发送了真实的登录名称”与“有人在同一个请求中输入了不同的名称”。`proxy/nginx.conf` 中的 `auth_request` 已经证明了调用者拥有_一个_有效的 Grafana 会话 —— 但它目前并没有将_这是谁的_会话向下传递给 alarm-api。

这**不是**一个中断的访问控制漏洞（未经身份验证的调用者已经在代理层被拒绝）。这是一个归属完整性漏洞：已登录的操作员可以在确认/解决操作上写上别人的名字。该问题的优先级被正确地界定为“中等 (Medium)”，而不是在这次检查中最初（错误地）标记的“最高 (Highest)”——有关更正信息，请参见 `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md`。

## 设计方案

使用 nginx 已经运行的 `auth_request` 子请求 —— 它调用 Grafana 的 `/api/user`，在其 JSON 响应中返回登录用户的 `login` 字段。捕获该值并将其作为受信任的请求头 (header) 转发给 alarm-api；让 alarm-api 优先使用该请求头而不是请求体中的字段。

```text
proxy/nginx.conf, location /auth-check:
 proxy_pass http://grafana:3000/api/user;
 # NEW: capture the response body's "login" field so /alarm-api/
 # can forward it as a header the upstream service can trust.
 auth_request_set $verified_user $upstream_http_x_grafana_user;
 # (requires Grafana's /api/user response to expose login via a
 # header, OR a small Lua/njs snippet to parse the JSON body --
 # see "Open question" below, this is the one design decision
 # this spec does NOT resolve outright)

location /alarm-api/ {
 auth_request /auth-check;
 auth_request_set $verified_user ...;
 proxy_set_header X-Verified-User $verified_user;
 proxy_pass http://alarm-api:4000/;
}
```

```js
// services/alarm-api/server.js, transitionAlarm()
const verifiedUser = req.headers["x-verified-user"];
const claimedActor = req.body[actorField];
if (verifiedUser && claimedActor !== verifiedUser) {
  // Log the mismatch (real signal -- someone tampered with the
  // client, or the two are legitimately different for a reason we
  // don't understand yet). Do NOT silently accept -- and don't
  // silently overwrite either, until we've seen real mismatch
  // traffic and know which case we're actually seeing.
  console.warn(
    `actor mismatch: verified=${verifiedUser} claimed=${claimedActor}`,
  );
}
const actor = verifiedUser || claimedActor; // prefer verified once trusted
```

## 本规范未解决的悬而未决的问题

Nginx 的 `auth_request_set` 只能捕获响应的**请求头 (header)**，如果没有 njs/Lua 模块，则无法解析 JSON 响应**体 (body)**（`/api/user` 返回的是作为 JSON 的 `{"login": "...", ...}`，而不是请求头）。有两个实际选项，目前尚未选择：

1. 添加一个 njs (`ngx_http_js_module`) 代码片段来解析 JSON 响应体并从中设置一个变量 —— 会有更多的变动部分，但仍然保持在 nginx 层面。
2. 让 alarm-api 自己在服务端调用 Grafana 的 `/api/user`（服务到服务，使用转发的会话 Cookie），而不是信任来自 nginx 的任何信息 —— 减少了 nginx 中的变动部分，但 alarm-api 现在需要为每个写请求进行一次额外的网络调用。

建议在选择之前，针对实际的 `nginx:alpine` 的可用模块（`ngx_http_js_module` 可能未编译进去）对两者进行评估，而不是直接假设选项 1 可行。

## 部署计划

1. 首先仅实现基于 `console.warn` 的不匹配日志记录（不对现有的正确客户端改变行为）—— 可以安全发布，并能生成是否确实发生过不匹配的真实证据。
2. 观察一段时间的日志（以天为单位，而不是分钟）。
3. 只有在此之后，才能决定是让 `verifiedUser` 具有权威性（静默覆盖 `claimedActor`）还是直接拒绝不匹配的情况 (`403`) —— 这个决定需要真实的不匹配频率数据，而不是现在的猜测。

## 测试计划

- 单元测试：存在请求头 + 匹配的请求体 -> 无警告，正常写入。
- 单元测试：存在请求头 + 不匹配的请求体 -> 记录警告，写入仍然成功（阶段 1 的行为）。
- 集成测试：使用带有有效会话 Cookie 但伪造了 `acknowledged_by` 字段的实际 `curl` 命令请求 `/alarm-api/alarms/ack` -> 确认在 `docker logs ims-alarm-api` 中可以看到该不匹配项。
- 回归测试：现有的告警控制台确认/解决按钮仍然能实现端到端的正常工作（这是整个系统中唯一的写入路径 —— 在处理中等优先级的加固项时，破坏此路径是不可接受的回归错误）。

## 超出本规范范围的内容

- 向 alarm-api 添加第二种独立的凭据（通过 Grafana 的基于会话的信任是一种有意为之的、已记录在案的设计选择 —— 参见 `SECURITY_MODEL.md` 边界 1a —— 在此处不作重新考虑）。
- 确认/解决接口的速率限制 / 防滥用机制 —— 这是一个独立的问题，而不是身份验证问题。
