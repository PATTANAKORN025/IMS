# Thin wrapper, not a fork: same image, same entrypoint-wrapper.sh mount,
# same runtime behavior. Only addition is a same-release Alpine package
# patch (this is Alpine 3.23.x, not the EOSL-suspected 3.20.3 line node-red
# was on) -- verified live 2026-08-21 via `apk upgrade --simulate`: real
# updates available, including libcrypto3/libssl3 3.5.6-r0 -> 3.5.7-r0,
# which resolves CVE-2026-45447 (Trivy-confirmed HIGH, target=pgbouncer's
# Alpine OS layer). Same low-risk pattern as nodered_data/Dockerfile's fix.
FROM edoburu/pgbouncer:v1.25.2-p0

USER root
RUN apk update && apk upgrade --no-cache
USER postgres
