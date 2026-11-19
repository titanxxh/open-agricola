#!/usr/bin/env bash
set -euo pipefail
export CI=true HOME=/tmp NPM_CONFIG_USERCONFIG=/dev/null npm_config_nodedir=/usr/local
export npm_config_jobs=1 MAKEFLAGS=-j1 npm_config_child_concurrency=1
export npm_config_build_from_source=true npm_config_manage_package_manager_versions=false
case "$1" in
  fetch)
    # Only the trusted fetch plan has network access. It maps package names to public registry integrities.
    cd /cache
    python3 /usr/local/lib/oa/fetch-dependencies.py
    pnpm fetch --ignore-scripts --store-dir /cache/store
    rm -rf node_modules pnpm-lock.yaml package.json
    ;;
  install)
    cd /app
    cp /inputs/{pnpm-lock.yaml,package.json,.npmrc} .
    cp -a --reflink=auto /packages/store .store
    pnpm install --prod=false --offline --frozen-lockfile --store-dir /app/.store --config.package-import-method=copy
    rm -rf .store
    node -e 'require("canvas").createCanvas(1,1); require("isolated-vm"); new (require("better-sqlite3"))(":memory:").close()'
    ;;
  build)
    cd /app
    tar -xf /inputs/source.tar
    # Git never supplies node_modules or build destinations for an ordinary release.
    for dir in node_modules frontend-dist dist viewer-builds output; do
      if [[ -e "$dir" || -L "$dir" ]]; then echo "reserved build path: $dir" >&2; exit 1; fi
    done
    cp -a --reflink=auto /dependencies/node_modules .
    export AGRICOLA_I18N_DIR=/i18n PUBLIC_ASSET_VALIDATION_DIR=/public-assets REPLAY_VIEWER_ROOT=/app/viewer-builds
    # Candidate verification owns typechecking. Generate the same production frontend without repeating tsc on the app host.
    pnpm run build:cards-manifest
    export OPEN_AGRICOLA_FRONTEND_TARGET=prerelease-hosted VITE_BASE_PATH=/open-agricola/ VITE_API_BASE='' VITE_WS_BASE=''
    export VITE_ENABLE_COMMUNITY_DECK=true VITE_SANDBOX_EXECUTOR=browser RAYON_NUM_THREADS=1 MALLOC_ARENA_MAX=2
    mkdir /tmp/oa-workers
    for worker in sandbox card-tests; do node scripts/prerelease/prepare-frontend-worker.mjs "$worker" /tmp/oa-workers; done
    OA_PREPARED_FRONTEND_WORKERS=/tmp/oa-workers pnpm run build:hosted-frontend --no-typecheck
    unset OPEN_AGRICOLA_FRONTEND_TARGET VITE_BASE_PATH VITE_API_BASE VITE_WS_BASE VITE_ENABLE_COMMUNITY_DECK VITE_SANDBOX_EXECUTOR
    pnpm run build:replay-viewer
    mv dist frontend-dist
    # Keep the dependency tree built for this revision, including native addons.
    # Re-resolving or pruning it here can invoke npm lifecycle hooks or contact the registry.
    node -e 'const m=require("./frontend-dist/frontend-build.json"); if(m.gameBuildId!==process.env.GAME_BUILD_ID||m.releaseChannel!=="prerelease"||m.deploymentTarget!=="prerelease-hosted") process.exit(1)'
    ;;
  trial) exec bash /usr/local/lib/oa/trial.sh ;;
  *) exit 2 ;;
esac
