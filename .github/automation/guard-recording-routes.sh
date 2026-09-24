#!/usr/bin/env bash
set -Eeuo pipefail
node "$(dirname "$0")/guard-recording-routes.mjs" "$@"
