.PHONY: up up-prod down restart verify backup restore test-unit test-load logs

up:
	docker compose -f docker-compose.yaml -f docker-compose.override.yaml up -d

up-prod:
	docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

down:
	docker compose down

restart:
	docker compose restart node-red grafana alertmanager prometheus

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
	npm test --prefix tests/unit

test-load:
	k6 run tests/k6/pipeline-stress.js

logs:
	docker compose logs -f node-red
