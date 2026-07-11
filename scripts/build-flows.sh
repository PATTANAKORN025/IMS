#!/bin/sh
# Safely merge ingestion and alerting flows into the runtime payload
jq -s 'add' nodered_data/flows/ingestion.json nodered_data/flows/alerting.json > nodered_data/flows.json
echo "Node-RED flows merged successfully."
