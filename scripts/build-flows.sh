#!/bin/sh
# Safely merge all split flow files into the runtime payload.
# Globs nodered_data/flows/*.json so a new split file is never silently
# excluded (see: ldi_ingestion.json shipped but never wired into flows.json).
set -e

jq -s 'add' nodered_data/flows/*.json > nodered_data/flows.json

DUP=$(jq -r '.[].id' nodered_data/flows.json | sort | uniq -d)
if [ -n "$DUP" ]; then
    echo "FAILED: duplicate node ID(s) across flow files:"
    echo "$DUP"
    exit 1
fi

COUNT=$(ls nodered_data/flows/*.json | wc -l | tr -d ' ')
echo "Node-RED flows merged successfully ($COUNT source files)."
