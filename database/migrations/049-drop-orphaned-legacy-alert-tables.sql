-- ══════════════════════════════════════════════════════════════
-- 049: Drop orphaned legacy alert_rules / alert_history tables
-- ══════════════════════════════════════════════════════════════
-- World-class audit Phase 2 orphan sweep: these two tables (created in
-- postgres/init/001, seeded with 7 sample rows) predate the Grafana-native
-- + Prometheus/Alertmanager alerting architecture this session built out.
-- Confirmed dead, not a documented forward-looking tier like the CAGG
-- tiers (migration 044's comment) -- genuinely zero producers and zero
-- consumers:
--   - alert_history: 0 rows, never INSERTed into by anything (grepped
--     Node-RED flows, migrations, dashboards -- nothing writes to it)
--   - alert_rules: 7 rows, all from the original seed INSERT in
--     postgres/init/001, never read by any live dashboard (only appears
--     in monitoring/grafana/dashboard-backups/, a stale directory not
--     mounted into the Grafana container -- see docker-compose.yaml)
--
-- Real alerting now lives entirely in
-- monitoring/grafana/provisioning/alerting/ (Grafana-native) and
-- monitoring/prometheus/rules/ + monitoring/alertmanager/ (Prometheus).

DROP TABLE IF EXISTS public.alert_history;
DROP TABLE IF EXISTS public.alert_rules;
