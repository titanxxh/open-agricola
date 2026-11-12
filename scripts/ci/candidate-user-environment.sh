#!/bin/bash -p
# Root-owned bootstrap wrapper; runuser/PAM and the user manager must use the same private paths.
set -euo pipefail
candidate_environment=(
  HOME=/home/oa-candidate USER=oa-candidate LOGNAME=oa-candidate SHELL=/bin/bash
  PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=C.UTF-8
  XDG_CONFIG_HOME=/home/oa-candidate/.config XDG_CACHE_HOME=/home/oa-candidate/.cache
  XDG_DATA_HOME=/home/oa-candidate/.local/share XDG_STATE_HOME=/home/oa-candidate/.local/state
  XDG_RUNTIME_DIR=/run/user/61000 XDG_CONFIG_DIRS=/etc/xdg XDG_DATA_DIRS=/usr/local/share:/usr/share
  DOCKER_CONFIG=/home/oa-candidate/.docker DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/61000/bus
  # Stop environment.d from re-importing the runner's global XDG paths for this UID.
  SYSTEMD_ENVIRONMENT_GENERATOR_PATH=/run/oa-ci-isolation/environment-generators
)
if [[ ${1:-} == --user-manager ]]; then
  shift
  [[ -n ${NOTIFY_SOCKET:-} ]] || { echo 'Missing systemd manager notification socket' >&2; exit 1; }
  for candidate_key in NOTIFY_SOCKET LISTEN_PID LISTEN_FDS LISTEN_FDNAMES INVOCATION_ID JOURNAL_STREAM SYSTEMD_EXEC_PID; do
    if [[ -v $candidate_key ]]; then candidate_environment+=("$candidate_key=${!candidate_key}"); fi
  done
fi
exec /usr/bin/env -i "${candidate_environment[@]}" "$@"
