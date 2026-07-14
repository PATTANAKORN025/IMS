.PHONY: up up-prod down restart build-flows deploy-flows verify backup restore test-unit test-load test-visual logs validate-flows validate-dashboards snapshot-flows doctor

build-flows:
	bash scripts/build-flows.sh

up: build-flows
	docker compose -f docker-compose.yaml up -d

up-prod: build-flows
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

down:
	docker compose down

restart:
	docker compose restart node-red grafana alertmanager prometheus

deploy-flows:
	@echo "Deploying split flows to Node-RED..."
	curl -X POST http://127.0.0.1:1880/flows -H 'Content-Type: application/json' -d @<(jq -s 'add' nodered_data/flows/*.json)

verify:
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts\verify-deployment.ps1
else
	bash scripts/verify-deployment.sh
endif

backup:
	bash scripts/backup-db.sh

restore:
	bash scripts/restore-db.sh $(FILE)

test-unit:
	node tests/unit/boundary-validation.test.js
	node tests/unit/parser.test.js
	node tests/unit/counter-wraparound.test.js
	node tests/unit/v2-parser.test.js

test-load:
	k6 run tests/k6/pipeline-stress.js

test-visual:
	npx playwright install chromium 2>/dev/null
	node tests/playwright/dashboard-visual-regression.js

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
	@docker --version 2>NUL || (echo "FAIL: Docker not found" && exit 1)
	@echo "  Docker: OK"
	@docker compose version 2>NUL || (echo "FAIL: docker compose not found" && exit 1)
	@echo "  Docker Compose: OK"
	@node --version 2>NUL || (echo "FAIL: Node.js not found" && exit 1)
	@echo "  Node.js: OK"
	@jq --version 2>NUL || (echo "WARN: jq not found (needed for build-flows)" && exit 1)
	@echo "  jq: OK"
	@echo "=== All checks passed ==="
# ── IaC: Validate dashboards for corruption ─────────────
validate-dashboards:
	@echo "Checking dashboards for corrupted hex codes..."
	@grep -rE '[a-zA-Z]+#[0-9a-fA-F]{6}' monitoring/grafana/dashboards/ && \
	  (echo "FAIL: Corrupted hex code found in dashboard text" && exit 1) || \
	  echo "  No corrupted hex codes found."
	@echo "Dashboard validation passed."
