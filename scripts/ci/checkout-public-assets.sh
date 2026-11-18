#!/usr/bin/env bash
# Trusted runner step: shallow-check out the public asset repository at the SHA a repository checkout pins in
# public-assets.ref, outside that checkout, so browser tasks serve the pinned assets locally (E2E_PUBLIC_ASSET_DIR)
# and builds validate their metadata offline (PUBLIC_ASSET_VALIDATION_DIR) instead of depending on GitHub Pages.
# The pin is read from the Git object, so a checked-out symlink or modified file cannot redirect the read.
#   bash scripts/ci/checkout-public-assets.sh <repository-checkout> <new-destination>
set -euo pipefail
(( $# == 2 )) || { echo 'Usage: checkout-public-assets.sh <repository-checkout> <new-destination>' >&2; exit 1; }
repository="$1" destination="$2"
version="$(git -C "$repository" show HEAD:public-assets.ref | tr -d '[:space:]')"
[[ $version =~ ^[0-9a-f]{40}$ ]] || { echo 'public-assets.ref must contain one full lowercase SHA' >&2; exit 1; }
[[ ! -e $destination ]] || { echo "Public asset destination already exists: $destination" >&2; exit 1; }
git init --quiet "$destination"
for attempt in 1 2 3; do
  git -C "$destination" fetch --quiet --no-tags --depth 1 https://github.com/titanxxh/open-agricola-assets.git "$version" && break
  (( attempt < 3 )) || { echo 'Could not fetch the pinned public assets' >&2; exit 1; }
  sleep $(( attempt * 5 ))
done
git -C "$destination" checkout --quiet --detach FETCH_HEAD
[[ $(git -C "$destination" rev-parse HEAD) == "$version" ]] || { echo 'Fetched public assets differ from the pin' >&2; exit 1; }
directory="$(realpath "$destination")"
if [[ -n ${GITHUB_OUTPUT:-} ]]; then printf 'directory=%s\n' "$directory" >> "$GITHUB_OUTPUT"; fi
printf '%s\n' "$directory"
