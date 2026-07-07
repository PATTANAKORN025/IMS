.PHONY: up up-prod down restart deploy-flows verify backup restore test-unit test-load test-visual logs

up:
	docker compose -f docker-compose.yaml -f docker-compose.override.yaml up -d

up-prod:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

down:
	docker compose down

restart:
	docker compose restart node-red grafana alertmanager prometheus

deploy-flows:
	@echo "Deploying split flows to Node-RED..."
	curl -X POST http://127.0.0.1:1880/flows -H 'Content-Type: application/json' -d @<(jq -s 'add' node-red/flows/*.json)

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

test-load:
	k6 run tests/k6/pipeline-stress.js

test-visual:
	npx playwright install chromium 2>/dev/null
	node tests/playwright/dashboard-visual-regression.js

logs:
	docker compose logs -f node-red
