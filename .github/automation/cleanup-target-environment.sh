#!/usr/bin/env bash
set -euo pipefail

[[ -n "${APVG_TARGET_ENV_FILE:-}" ]] || exit 0
[[ -n "${APVG_WORK_DIR:-}" ]] || exit 0

context="$APVG_WORK_DIR/source-context.json"
if [[ -f "$context" ]]; then
  root_dir="$(jq -r '.rootDir // empty' "$context" 2>/dev/null || true)"
  if [[ -n "$root_dir" && -d "$root_dir" ]]; then
    root_dir="$(realpath -- "$root_dir")"
    case "$root_dir" in
      "$RUNNER_TEMP"/*|"$GITHUB_WORKSPACE"|"$GITHUB_WORKSPACE"/*) ;;
      *) exit 1 ;;
    esac
    if [[ -f "$root_dir/wrangler.toml" || -f "$root_dir/wrangler.json" || -f "$root_dir/wrangler.jsonc" ]]; then
      rm -f -- "$root_dir/.dev.vars"
    elif [[ -f "$root_dir/settings.gradle" || -f "$root_dir/settings.gradle.kts" || -f "$root_dir/build.gradle" || -f "$root_dir/build.gradle.kts" || -f "$root_dir/app/src/main/AndroidManifest.xml" || -f "$root_dir/android/app/src/main/AndroidManifest.xml" ]]; then
      if [[ -d "$root_dir/android" ]]; then
        rm -f -- "$root_dir/android/local.properties"
      else
        rm -f -- "$root_dir/local.properties"
      fi
    else
      rm -f -- "$root_dir/.env"
    fi
  fi
fi

# A target application may have printed configuration into this local diagnostic log.
rm -f -- "$APVG_WORK_DIR/dev-server.log"
