#!/usr/bin/env bash
# Owner-side target lock is held. Arguments after the limits are passed verbatim to docker.
set -euo pipefail
name=$1 root=$2 reserve=$3 growth=$4; shift 4
free_bytes() { stat --file-system --format='%a %S' "$root" | awk '{printf "%.0f\n", $1*$2}'; }
baseline=$(free_bytes)
minimum=$(( baseline - growth ))
(( minimum >= reserve )) || minimum=$reserve
(( baseline > minimum )) || { echo 'Insufficient build workspace' >&2; exit 1; }
docker run --detach --name "$name" --log-driver local --log-opt max-size=1m --log-opt max-file=2 "$@" >/dev/null
while :; do
  if (( $(free_bytes) < minimum )); then
    docker kill "$name" >/dev/null || true
    echo 'Build consumed its disk budget' >&2
    exit 1
  fi
  read -r stopped code < <(docker inspect --format '{{.State.Running}} {{.State.ExitCode}}' "$name")
  if [[ "$stopped" == false ]]; then
    if (( code != 0 )); then echo "Preparation container exited with code $code" >&2; fi
    exit "$code"
  fi
  sleep 0.25
done
