#!/bin/sh
# Safely merge all flow fragments into the runtime payload
jq -s 'add' nodered_data/flows/*.json > nodered_data/flows.json
echo "Node-RED flows merged successfully."
