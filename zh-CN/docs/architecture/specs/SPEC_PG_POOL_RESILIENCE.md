<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 规范：PG Pool 错误处理弹性

> 状态：**已于 2026-08-15 部署。** 请参阅底部的结果部分。此问题是在 2026-08-14
> 证据审查（只读，仅读取日志/配置，未触及运行时）期间发现的。
> 这是该审查中得出的最高优先级项目——一个刚刚污染了 Soak Attempt 6 的真实错误。

## 发生了什么及证据

`scripts/soak-test-reports/soak-log.tsv` (Attempt 6) 显示在运行约 1 小时后的
`2026-08-14T05:51:52Z` 出现了一次意外重启——本会话中没有任何操作会导致该重启：

```text
2026-08-14T05:05:14Z 1324 0 0 no  1 27
2026-08-14T05:51:52Z NaN  0 0 yes 0 28
2026-08-14T06:05:14Z 604  0 0 no  1 28
```

`public.container_restart_audit`（在本次会话早期正是为了此类调查而构建的）确认了涉及的容器：

```text
ims-alarm-api | die  | 2026-08-14 05:51:37+00
ims-alarm-api | start | 2026-08-14 05:51:38+00
ims-node-red | die  | 2026-08-14 05:51:38+00
ims-node-red | start | 2026-08-14 05:51:39+00
```

该时间窗口内 `docker logs ims-node-red` 显示了实际的崩溃情况：

```text
14 Aug 05:51:35 - [error] [function:Auth & Validate] LDI staging INSERT failed: client_idle_timeout
14 Aug 05:51:35 - [red] Uncaught Exception:
14 Aug 05:51:35 - [error] error: client_idle_timeout
  at parseErrorMessage (/data/node_modules/pg-protocol/dist/parser.js:305:11)
  ...
```

`ims-alarm-api` 的日志显示出相同的情形：未处理的 `pg` 客户端错误导致整个 Node.js 进程崩溃（表现为原始异常转储，随后进程重启并重新打印 "alarm-api listening on :4000"）。

## 根本原因

`ims-pgbouncer` 的实时配置 (`docker exec ims-pgbouncer cat /etc/pgbouncer/pgbouncer.ini`) 包含：

```ini
# Connection sanity checks, timeouts
server_idle_timeout = 300
# Dangerous timeouts
client_idle_timeout = 300
```

`client_idle_timeout = 300` 在配置文件的注释中被标记为 "Dangerous timeouts"——编写此配置的人已经知道这是有风险的。PgBouncer 会强制关闭任何空闲 300 秒的客户端连接。无论是 `node-red` 的 `pg.Pool`（通过函数节点内联构造，例如通过 `global.get('pgPool')`），还是 `services/alarm-api/server.js` 的 `pool = new Pool({...})`，都没有注册 `pool.on('error', ...)` 处理程序。当 PgBouncer 终止一个空闲连接时，由此产生的错误表现为 **池上未处理的 `error` 事件**，Node.js 将其视为未捕获的异常——从而杀死整个进程，而不仅仅是那一个查询。

Docker 的 `restart: unless-stopped` 策略在 1-2 秒内使容器恢复。没有证据表明数据丢失（两个容器在日志中都显示重启后立即正常运行）。但这恰恰是 Soak Attempt 6 旨在捕获的“意外重启”情况，而它确实捕获到了。

**这很可能也是早期 soak 尝试中某些不稳定现象的根本原因，甚至可能是促成本会话开展整个可观察性工作的那个长达 16 小时的原始事件的原因**——尽管尚未确认（Docker 日志保留时间不足以追溯到那么久，参见 `SOAK_TEST_LOG.md` Attempt 1），但失败特征相符：Node.js 服务崩溃并静默重启，且没有任何应用程序级别的原因。

## 设计

在每一个构造 `pg.Pool` 的地方添加一个 `pool.on('error', ...)` 处理程序，这样空闲连接断开（来自 PgBouncer、网络波动或 Postgres 重启）会被记录下来，连接池会恢复下一个客户端而不是让进程崩溃：

```js
// services/alarm-api/server.js
const pool = new Pool({/* ... 现有配置 ... */});
pool.on("error", (err) => {
  console.error(
    "pg pool idle-client error (non-fatal, pool recovers):",
    err.message,
  );
});
```

```js
// node-red: 无论在哪里通过 global.set('pgPool', ...) 构造共享池
// （可能是启动/全局配置函数节点）—— 采用相同模式：
pgPool.on("error", (err) => {
  node.warn(
    "pg pool idle-client error (non-fatal, pool recovers): " + err.message,
  );
});
```

这是针对此特定 `node-postgres` 故障模式标准的且有文档记录的修复方法（`pool.on('error')` 的存在正是为了防止空闲客户端错误导致进程崩溃）——这并不是新颖的设计，而是缺失的标准保护措施。

**次要考虑因素，非本规范的主要修复内容**：考虑到 `node-red` 和 `alarm-api` 都持有寿命较长的池化连接，在 LDI 批次之间它们可能合理地处于空闲状态超过 5 分钟，因此 `client_idle_timeout = 300` 是否是正确的值？或者是应该禁用它 (`0`) 还是提高它？`on('error')` 处理程序阻止了*崩溃*；但它并未解决*为什么*连接会闲置那么长时间以至于一开始就触发超时。在决定是否也要修改 PgBouncer 配置之前，值得测量实际的空闲间隙（根据真实证据，而非猜测）——并且修改 PgBouncer 配置需要重启，因此无论如何该部分明确不在当前冻结期解禁之前的工作范围内。

## 部署计划

1. 将 `pool.on('error', ...)` 处理程序添加到 `server.js` 和 node-red 全局池设置中——两个小而独立的更改。
2. 重新部署 (`docker compose restart node-red alarm-api`) —— **不要在 soak 冻结解除之前进行**，因为这本身就是一次重启。
3. 重新运行 `tests/e2e/ingestion-latency-check.js` 确认没有任何功能回归。
4. 在应用此修复的情况下开始新的 soak 尝试——如果修复是正确的，`client_idle_timeout` 断开应完全不再表现为 `any_container_restarted=yes` 事件（取而代之的是连接池记录一条警告并继续运行）。

## 测试计划

- 单元测试/手动：在一次性测试中通过使池化连接保持打开状态超过 300 秒来强制触发 `client_idle_timeout`，确认进程没有崩溃且下一个查询仍然成功。
- 回归测试：现有完整测试套件（根据 pre-commit hook 执行的 `Unit Tests` 和 `Parser v2 Tests`）—— 此更改涉及共享池设置，风险较低但不能假定无风险。
- Soak 测试：真正的考验是时间——如果随后的 soak 尝试能度过任何 5 分钟以上的空闲间隔且不发生重启事件，那这就是证明修复有效的实际证据，这比任何单元测试都更有说服力。

## 优先级

在整个待办事项中**优先级最高**——高于 `SPEC_ALARM_ACTOR_IDENTITY.md` / `SPEC_SIMULATOR_REALISM.md` / `SPEC_ALERT_HYGIENE.md` 中的 3 个项目。那些是强化和完善工作。这是一个活跃的错误，并且它正在使唯一无法单靠工程努力满足的标准（`SYSTEM_TRUST_REPORT.md` #5, 72 小时 soak）失效——这个问题没修复的一天，soak 计时就可能被甚至不属于本次会话活动的其他因素重置一天。

## 结果

完全按部署计划实施：在 `services/alarm-api/server.js`（在 `new Pool({...})` 后内联）和 `nodered_data/settings.js` 中添加了 `pool.on('error', ...)`（池构造从内联对象字面量属性提取为命名的 `sharedPgPool` 常量，以专门能够在它被引用到 `functionGlobalContext.pgPool` 之前附加 `.on('error', ...)` ——这是一个小的结构变化，池配置/行为保持不变，除了添加处理程序外没有功能上的改变）。孤立的差异：共 2 个文件，18 行添加 / 9 行删除（主要是 settings.js 重组）。

于 2026-08-15T05:59:41Z 通过 `docker compose restart node-red alarm-api` 进行部署（由于这两个服务都需要修复，因此这次无法拆分为更窄的单一服务重启）。两者都干净利落地恢复了：`docker logs` 显示正常启动（`Started flows`, `alarm-api listening on :4000`），没有错误。按部署计划第 3 步重新运行了回归检查 (`tests/e2e/ingestion-latency-check.js`)：`ldi_data` P95 为 8ms（之前会话早期测量值为 22ms，完全在正常波动范围内，并非回归），`sys_metrics`/`net_metrics`/`ldi_metrics` 仍然约为 0-1ms，`ldi_alarm_log (nearest)` 已知的模拟延迟伪影保持不变（与此修复无关）。单元测试：`parser.test.js` 和 `v2-parser.test.js` 均通过，0 回归。

**明确声明本测试计划中尚未证明的内容**：在这一阶段没有直接强制出现实际的 `client_idle_timeout` 崩溃场景（PgBouncer 在 300 秒后强制关闭空闲的池化连接）并观察其存活情况——这需要一个专门的强制空闲 5 分钟以上的测试，或等待此修复在正常运行期间遇到真实的空闲间隔。部署后立即开始的耐久运行（`SOAK_TEST_LOG.md` Attempt 10）正是随时间推移积累的实际证明：如果修复正确，多小时运行期间的 `client_idle_timeout` 断开将只表现为一条无害的日志行，而不是一个 `any_container_restarted=yes` 事件。在明确批准运行后，这也是 `FAULT_INJECTION_PLAN.md` 场景 3 的任务。
