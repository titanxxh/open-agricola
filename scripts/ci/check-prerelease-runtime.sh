#!/usr/bin/env bash
# Exercise the published runtime candidate against the actual protected-main source and external pins.
set -euo pipefail
scratch=$(mktemp -d "${RUNNER_TEMP:-/tmp}/oa-runtime-proof-XXXXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch"/{inputs,fetch,dependencies,app,i18n}
sha=$(git rev-parse HEAD)
git archive --format=tar --output="$scratch/source.tar" "$sha"
for file in package.json pnpm-lock.yaml .npmrc; do git show "$sha:$file" >"$scratch/inputs/$file"; done
bash scripts/ci/checkout-public-assets.sh "$PWD" "$scratch/assets"
i18n=$(node -p 'JSON.parse(require("node:fs").readFileSync("i18n.ref")).revision')
[[ $i18n =~ ^[a-f0-9]{40}$ ]]
git -C "$scratch/i18n" init -q
git -C "$scratch/i18n" fetch --quiet --no-tags --depth=1 https://github.com/titanxxh/open-agricola-i18n.git "$i18n"
git -C "$scratch/i18n" checkout -q --detach FETCH_HEAD

stage() {
  local step=$1 network=$2
  shift 2
  docker run --rm --user "$(id -u):$(id -g)" --network "$network" --read-only \
    --cap-drop ALL --security-opt=no-new-privileges --memory 1536m --memory-swap 1536m --cpus 1 --pids-limit 128 \
    --tmpfs /tmp:size=768m,mode=1777 --tmpfs /var/lib/postgresql \
    --env "GAME_BUILD_ID=$sha" --env RELEASE_CHANNEL=prerelease "$@" \
    --entrypoint bash oa-runtime:smoke /usr/local/lib/oa/prepare.sh "$step"
}
stage fetch bridge -v "$scratch/inputs/pnpm-lock.yaml:/inputs/pnpm-lock.yaml:ro" -v "$scratch/fetch:/cache"
stage install none -v "$scratch/inputs:/inputs:ro" -v "$scratch/fetch:/packages:ro" -v "$scratch/dependencies:/app"
stage build none -v "$scratch/app:/app" -v "$scratch/source.tar:/inputs/source.tar:ro" \
  -v "$scratch/dependencies:/dependencies:ro" -v "$scratch/i18n:/i18n:ro" -v "$scratch/assets:/public-assets:ro"
mkdir -p "$scratch/app/output"
stage trial none -v "$scratch/app:/app:ro" --tmpfs /app/output:size=64m,mode=1777
