#!/usr/bin/env bash
# Copy Create React App build into Laravel public/ for combined hosting.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/front-end/build"
PUBLIC_DIR="${ROOT_DIR}/backend-app/public"

if [[ ! -f "${BUILD_DIR}/index.html" ]]; then
  echo "Missing ${BUILD_DIR}/index.html — run: cd front-end && npm ci && npm run build"
  exit 1
fi

echo "Syncing React build → backend-app/public ..."

rm -rf "${PUBLIC_DIR}/static"
cp -R "${BUILD_DIR}/static" "${PUBLIC_DIR}/static"

if [[ -d "${BUILD_DIR}/assets" ]]; then
  rm -rf "${PUBLIC_DIR}/assets"
  cp -R "${BUILD_DIR}/assets" "${PUBLIC_DIR}/assets"
fi

# CRA root files (manifest, favicon, etc.) — do not overwrite index.php
shopt -s nullglob
for f in "${BUILD_DIR}"/*; do
  base="$(basename "$f")"
  if [[ -f "$f" && "$base" != "index.html" ]]; then
    cp -f "$f" "${PUBLIC_DIR}/${base}"
  fi
done

cp -f "${BUILD_DIR}/index.html" "${PUBLIC_DIR}/spa.html"

echo "Done. SPA entry: public/spa.html"
