#!/usr/bin/env bash
# Root side of owner-local candidate verification (#1779), invoked by scripts/ci/owner-local-run.ts through sudo.
# It mirrors setup-/stop-candidate-isolation.sh for the owner machine: one disposable candidate UID with its own
# rootless Docker per run, one source copy per task sharing one test-service data directory, and a bounded
# cgroup teardown before the trusted collector reads anything. Candidate code never runs in this shell.
#   start   <policy-dir> <run-dir> <owner-uid> <public-assets-dir> <task>...   create the identity, copies, user manager and daemon
#   stop    <owner-uid> <task>...                          kill the subtree, delete the identity, hand copies over
#   cleanup <owner-uid>                                    remove the candidate home and runtime configuration
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
fail() { printf 'Owner-local isolation %s failed: %s\n' "${action:-?}" "$1" >&2; exit 1; }
action="${1:-}"; shift || true
[[ $EUID == 0 ]] || fail 'requires root through sudo'
uid=61000 home=/home/oa-candidate runtime=/run/oa-ci-isolation dropin=/run/systemd/system/user@61000.service.d
work="$home/work" shared="$home/shared-data"
unmount_candidate_mounts() {
  local mount
  while read -r mount; do
    [[ -n $mount ]] && umount --no-canonicalize "$mount"
  done < <(awk -v home="$home/" 'index($2, home) == 1 { print $2 }' /proc/self/mounts | sort -r)
  ! awk -v home="$home/" 'index($2, home) == 1 { found = 1 } END { exit !found }' /proc/self/mounts || fail 'candidate mounts remain'
}
task_name() { [[ $1 =~ ^[a-z0-9-]+$ ]] || fail "invalid task $1"; }
owner_uid() { [[ $1 =~ ^[1-9][0-9]*$ && $1 != "$uid" && ${SUDO_UID:-} == "$1" ]] || fail 'owner uid must be the invoking sudo user'; }

if [[ $action == start ]]; then
  (( $# >= 5 )) || fail 'usage: start <policy-dir> <run-dir> <owner-uid> <public-assets-dir> <task>...'
  policy="$(realpath "$1")" run="$(realpath "$2")" assets="$(realpath "$4")"; owner_uid "$3"; shift 4
  [[ -d $assets/.git && $(stat -c %u "$assets") == "$SUDO_UID" ]] || fail 'trusted public asset checkout is missing'
  for task in "$@"; do task_name "$task"; done
  [[ $(stat -c '%u %a' "$run") == "$SUDO_UID 700" && $(stat -c '%u %a' "$run/logs") == "$SUDO_UID 700" ]] || fail 'run and log directories must be owner-private'
  [[ -d $run/source/.git && $(stat -c %u "$run/source") == "$SUDO_UID" ]] || fail 'trusted source checkout is missing'
  # data/ becomes a root-made bind mount in every copy; a candidate path there (a tracked symlink in particular)
  # would redirect the root mkdir and mount, so the candidate tree must not contain it at all.
  [[ ! -e $run/source/data && ! -L $run/source/data ]] || fail 'the candidate tree contains data; refusing to mount over it'
  ! getent passwd oa-candidate >/dev/null && ! getent passwd "$uid" >/dev/null && ! getent group "$uid" >/dev/null || fail 'a candidate identity already exists; run stop and cleanup first'
  [[ ! -e $home && ! -e $runtime ]] || fail 'a previous candidate home or runtime remains; run cleanup first'
  [[ -x /usr/bin/rootlesskit && -x /usr/bin/dockerd-rootless-setuptool.sh && -x /usr/bin/newuidmap && -x /opt/oa-owner-local/node/bin/node ]] || fail 'owner machine is not provisioned (scripts/ci/owner-local-provision.sh)'
  docker_version="$(docker version --format '{{.Server.Version}}')"
  install -d -m 755 "$runtime" "$runtime/environment-generators"
  groupadd --gid "$uid" oa-candidate
  useradd --uid "$uid" --gid "$uid" -K UID_MAX="$uid" --create-home --shell /bin/bash oa-candidate
  setfacl --remove-all --remove-default "$home"; chmod 700 "$home"
  grep -q '^oa-candidate:' /etc/subuid && grep -q '^oa-candidate:' /etc/subgid || fail 'no subordinate ids were allocated'
  # One private copy per task; every copy's ignored data/ is the same directory, so `local-services --test`
  # reuses one set of credentials and one Compose project instead of recreating it per task.
  install -d -m 700 "$work" "$shared" "$home/tmp" "$home/.cache"
  # Trusted browsers from provisioning; the candidate's own `playwright install` then finds them present.
  [[ -d /opt/oa-owner-local/ms-playwright ]] && cp -a /opt/oa-owner-local/ms-playwright "$home/.cache/ms-playwright"
  # A candidate-owned copy of the pinned public assets for offline metadata validation (git refuses foreign owners).
  cp -a "$assets" "$home/public-assets"
  for task in "$@"; do
    cp -a "$run/source" "$work/$task"
    target="$work/$task/data"
    [[ ! -e $target && ! -L $target ]] || fail "copy for $task contains data"
    mkdir -m 700 "$target"
    [[ ! -L $target && $(realpath -e "$target") == "$target" ]] || fail "unexpected data path for $task"
    mount --bind "$shared" "$target"
  done
  chown -R --no-dereference "$uid:$uid" "$home"
  install -m 644 "$policy/scripts/ci/candidate-isolation-smoke.ts" "$runtime/smoke.mts"
  printf 'trusted inert marker\n' > "$runtime/protected-marker"; chmod 644 "$runtime/protected-marker"
  install -m 755 "$policy/scripts/ci/candidate-user-environment.sh" "$runtime/candidate-user-environment.sh"
  install -d -m 755 "$dropin"
  # /run is often mounted noexec on owner machines, so the wrapper is read by bash -p rather than executed.
  printf '[Service]\nExecStart=\nExecStart=/bin/bash -p %s/candidate-user-environment.sh --user-manager /usr/lib/systemd/systemd --user\n' "$runtime" > "$dropin/50-candidate-environment.conf"
  # Bound the whole candidate subtree (tasks, user manager, rootless daemon and its containers) on a shared machine.
  systemctl set-property --runtime user-$uid.slice MemoryMax=64G TasksMax=16384 CPUWeight=50
  systemctl daemon-reload
  session=(runuser -u oa-candidate -- /bin/bash -p "$runtime/candidate-user-environment.sh")
  loginctl enable-linger oa-candidate
  systemctl start user@$uid.service
  for attempt in {1..40}; do "${session[@]}" systemctl --user show-environment >/dev/null 2>&1 && break; sleep 0.25; done
  environment="$("${session[@]}" systemctl --user show-environment)"
  for expected in HOME=$home XDG_RUNTIME_DIR=/run/user/$uid DOCKER_CONFIG=$home/.docker DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus; do
    grep -Fx -- "$expected" <<< "$environment" >/dev/null || fail "user manager lacks $expected"
  done
  "${session[@]}" /usr/bin/dockerd-rootless-setuptool.sh install --force >&2
  for attempt in {1..60}; do "${session[@]}" docker --host unix:///run/user/$uid/docker.sock info >/dev/null 2>&1 && break; sleep 0.25; done
  "${session[@]}" docker --host unix:///run/user/$uid/docker.sock info >/dev/null
  printf '{"kind":"owner-local","uid":%d,"gid":%d,"home":"%s","work":"%s","socket":"/run/user/%d/docker.sock","node":"/opt/oa-owner-local/node/bin/node","privateDirectory":"%s","dockerVersion":"%s","limits":{"MemoryMax":"64G","TasksMax":16384,"CPUWeight":50}}\n' \
    "$uid" "$uid" "$home" "$work" "$uid" "$run/logs" "$docker_version" > "$runtime/context.json"
  chmod 644 "$runtime/context.json"
  printf 'Candidate identity, %d task copies and rootless Docker %s ready\n' "$#" "$docker_version"
elif [[ $action == stop ]]; then
  (( $# >= 1 )) || fail 'usage: stop <owner-uid> <task>...'
  owner_uid "$1"; shift
  for task in "$@"; do task_name "$task"; done
  cgroup=/sys/fs/cgroup/user.slice/user-$uid.slice
  wait_empty() {
    local until=$(( SECONDS + 15 ))
    while [[ -d $cgroup ]]; do
      grep -Fx 'populated 0' "$cgroup/cgroup.events" >/dev/null && return 0
      (( SECONDS < until )) || return 1
      sleep 0.1
    done
  }
  # Stop the user manager first so user units cannot restart descendants, then every payload unit.
  loginctl disable-linger oa-candidate 2>/dev/null || true
  systemctl stop user@$uid.service || true
  [[ -d $cgroup ]] && printf '1\n' > "$cgroup/cgroup.kill"
  systemctl stop user-$uid.slice || true
  wait_empty || { cat "$cgroup/cgroup.events" >&2; fail 'candidate descendants remain after bounded teardown'; }
  # No candidate process remains, so the mount table holds the real mount points; never resolve candidate paths
  # (a copy could have been moved and replaced by a symlink to a host mount point).
  unmount_candidate_mounts
  # Refuse collection if any account can restart the subtree; only then may the trusted collector read it.
  userdel oa-candidate
  ! getent passwd "$uid" >/dev/null || fail 'candidate account remains'
  chown --from="$uid" --no-dereference "$SUDO_UID:0" "$home"
  [[ -d $work ]] && chown -R --from="$uid" --no-dereference "$SUDO_UID:0" "$work"
  printf 'Candidate cgroup empty, identity deleted; private collection ownership transferred\n'
elif [[ $action == cleanup ]]; then
  (( $# == 1 )) || fail 'usage: cleanup <owner-uid>'
  owner_uid "$1"
  ! getent passwd "$uid" >/dev/null || fail 'stop the candidate before cleanup'
  unmount_candidate_mounts
  rm -rf --one-file-system "$home" "$runtime" "$dropin"
  rm -rf /run/systemd/system.control/user-$uid.slice.d
  systemctl daemon-reload
  sed -i '/^oa-candidate:/d' /etc/subuid /etc/subgid
  printf 'Candidate home and runtime removed\n'
else
  fail 'usage: start|stop|cleanup'
fi
