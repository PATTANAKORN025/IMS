.PHONY: up up-prod down restart build-flows deploy-flows verify backup restore test-unit test-load test-visual test-visual-ldi logs validate-flows validate-dashboards snapshot-flows doctor

build-flows:
	node scripts/build-flows.js

up: build-flows
	node scripts/check-env.js
	docker compose -f docker-compose.yaml up -d

up-prod: build-flows
	node scripts/check-env.js --strict
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

down:
	docker compose down

restart:
	docker compose restart node-red grafana alertmanager prometheus

# posts the built flows.json (same content as the split files concatenated);
# no jq or bash process substitution, so it runs from any make shell
deploy-flows: build-flows
	@echo "Deploying flows to Node-RED..."
	curl -X POST http://127.0.0.1:1880/flows -H "Content-Type: application/json" --data-binary @nodered_data/flows.json

verify:
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts\verify-deployment.ps1
else
	bash scripts/verify-deployment.sh
endif

backup:
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
else
	bash scripts/backup-db.sh
endif

restore:
	bash scripts/restore-db.sh $(FILE)

# every tests/unit/*.test.js; alarm-api-server needs its service deps, so it
# goes through the runner that installs them
test-unit:
	node -e "const fs=require('fs'),cp=require('child_process');for(const f of fs.readdirSync('tests/unit').filter(f=>f.endsWith('.test.js')&&f!=='alarm-api-server.test.js').sort())cp.execFileSync(process.execPath,['tests/unit/'+f],{stdio:'inherit'})"
	node scripts/run-alarm-api-tests.js

test-load:
	k6 run tests/k6/pipeline-stress.js

test-visual:
	npx playwright install chromium 2>/dev/null
	node tests/playwright/dashboard-visual-regression.js

test-visual-ldi:
	npx playwright install chromium 2>/dev/null
	GRAFANA_ADMIN_USER=$${GRAFANA_ADMIN_USER:-admin} GRAFANA_ADMIN_PASSWORD=$${GRAFANA_ADMIN_PASSWORD} node tests/playwright/ldi-responsive-regression.js

logs:
	docker compose logs -f node-red

# ── IaC: Flow Validation ──────────────────────────────────
validate-flows: build-flows
	@echo "Validating flows.json..."
	@node -e "const f=JSON.parse(require('fs').readFileSync('nodered_data/flows.json','utf8')); \
		if (!Array.isArray(f)) throw new Error('flows.json is not an array'); \
		console.log('  Nodes: ' + f.length); \
		const ids = f.map(n=>n.id).filter(Boolean); \
		const dupes = ids.filter((id,i)=>ids.indexOf(id)!==i); \
		if (dupes.length) throw new Error('Duplicate node IDs: ' + dupes.join(', ')); \
		const tabs = f.filter(n=>n.type==='tab'); \
		console.log('  Tabs: ' + tabs.length); \
		const funcs = f.filter(n=>n.type==='function'); \
		console.log('  Functions: ' + funcs.length); \
		console.log('  VALID')"
	@echo "Flows validated successfully."

# ── IaC: Snapshot flows before deploy ─────────────────────
snapshot-flows:
	@mkdir -p backups
	@cp nodered_data/flows.json backups/flows-$(shell date +%Y%m%d-%H%M%S).json
	@echo "Snapshot saved to backups/flows-$(shell date +%Y%m%d-%H%M%S).json"
	@ls -t backups/flows-*.json | head -5

# ── IaC: Doctor — check prerequisites ─────────────────────
doctor:
	@echo "=== IMS Doctor ==="
	@docker --version || (echo "FAIL: Docker not found" && exit 1)
	@echo "  Docker: OK"
	@docker compose version || (echo "FAIL: docker compose not found" && exit 1)
	@echo "  Docker Compose: OK"
	@node --version || (echo "FAIL: Node.js not found" && exit 1)
	@echo "  Node.js: OK"
	@echo "=== All checks passed ==="
# ── IaC: Validate dashboards for corruption ─────────────
validate-dashboards:
	@echo "Checking dashboards for corrupted hex codes..."
	@grep -rE '[a-zA-Z]+#[0-9a-fA-F]{6}' monitoring/grafana/dashboards/ && \
	  (echo "FAIL: Corrupted hex code found in dashboard text" && exit 1) || \
	  echo "  No corrupted hex codes found."
	@echo "Dashboard validation passed."
