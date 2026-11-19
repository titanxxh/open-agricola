#!/usr/bin/env bash
# Installs Playwright's Linux system packages for Chromium, WebKit and Firefox through a cacheable apt archive.
#
# Usage: install-browser-system-packages.sh <archive-directory>   (run where `pnpm exec playwright` resolves)
#
# The workflow restores <archive-directory> from actions/cache and saves it again on a miss. apt checks every cached
# .deb against the signed package indices and downloads a stale or altered one again. On a miss, a regional Ubuntu
# mirror sometimes serves the ~140 MB at 80-110 kB/s for half an hour, so the packages are first downloaded alone
# under a time limit and fetched from archive.ubuntu.com when the runner's mirror does not finish in time.
set -euo pipefail

archives=${1:?archive directory required}
engines=(chromium webkit firefox)
conf=/etc/apt/apt.conf.d/90-browser-system-packages
download_only=/etc/apt/apt.conf.d/91-browser-system-packages-download-only
deps=(pnpm exec playwright install-deps "${engines[@]}")
first_limit=${BROWSER_PACKAGES_FIRST_LIMIT:-180}
retry_limit=${BROWSER_PACKAGES_RETRY_LIMIT:-600}

cleanup() {
  sudo rm -rf "$conf" "$download_only" "$archives/partial" "$archives/lock"
  if [[ -d "$archives" ]]; then sudo chown -R "$(id -u):$(id -g)" "$archives"; fi
}
trap cleanup EXIT

sudo install -d -m 755 "$archives"
sudo install -d -m 700 -o _apt -g root "$archives/partial"
printf 'Dir::Cache::archives "%s/";\nAPT::Keep-Downloaded-Packages "true";\n' "$archives" | sudo tee "$conf" > /dev/null

# Playwright runs `apt-get update && apt-get install ...`; with Download-Only the install step only fills the archive.
download() {
  local limit=$1
  echo 'APT::Get::Download-Only "true";' | sudo tee "$download_only" > /dev/null
  local status=0
  timeout --kill-after=15 "$limit" "${deps[@]}" || status=$?
  sudo rm -f "$download_only"
  return "$status"
}

use_primary_archive() {
  local file
  for file in /etc/apt/sources.list.d/*.sources /etc/apt/sources.list; do
    [[ -f "$file" ]] || continue
    sudo sed -i -E 's#https?://[A-Za-z0-9.-]*archive\.ubuntu\.com/ubuntu/?#http://archive.ubuntu.com/ubuntu/#g' "$file"
  done
}

if ! download "$first_limit"; then
  echo "::warning::The runner's Ubuntu mirror did not deliver the browser system packages within ${first_limit} s; retrying from archive.ubuntu.com"
  use_primary_archive
  download "$retry_limit" || echo "::warning::archive.ubuntu.com did not finish either; installing without a time limit"
fi
"${deps[@]}"
sudo apt-get autoclean -qq
