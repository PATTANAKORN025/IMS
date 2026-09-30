# The archiver used to `apk add` its tools on every container start, which
# fails on a plant network without internet access and pulls whatever
# version is current that day. Installed once at build time instead.
# It reaches Docker only through the read-only docker-socket-proxy service
# (DOCKER_HOST), never the socket itself.
FROM docker:29-cli

RUN apk add --no-cache postgresql-client jq bash

ENTRYPOINT ["/bin/sh", "/scripts/observability-archiver.sh"]
