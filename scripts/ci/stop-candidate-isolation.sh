#!/usr/bin/env bash
set -euo pipefail
wait_candidate_cgroup() {
  local candidate_path="$1" candidate_wait_until="$(( SECONDS + $2 ))"
  while [[ -d $candidate_path ]]; do
    if grep -Fx 'populated 0' "$candidate_path/cgroup.events" >/dev/null; then return 0; fi
    (( SECONDS < candidate_wait_until )) || return 1
    sleep 0.1
  done
}
[[ $EUID == 0 && ${1:-} =~ ^[1-9][0-9]*$ ]] || exit 1
# Stop the user manager first so candidate user units cannot restart descendants.
loginctl disable-linger oa-candidate
systemctl stop user@61000.service
candidate_cgroup=/sys/fs/cgroup/user.slice/user-61000.slice
if [[ -d $candidate_cgroup ]]; then
  printf '1\n' > "$candidate_cgroup/cgroup.kill"

fi
# Stop all payload units too, so no service control plane can repopulate the subtree.
systemctl stop user-61000.slice
if ! wait_candidate_cgroup "$candidate_cgroup" 15; then
  echo 'Candidate descendants remain active after bounded teardown' >&2
  cat "$candidate_cgroup/cgroup.events" >&2
  exit 1
fi
# Refuse collection if a process escaped the dedicated subtree or an account can restart it.
userdel oa-candidate
# Only after every candidate process is gone may the trusted collector read the tree.
chown --from=61000 --no-dereference "$1:0" /home/oa-candidate
chown -R --from=61000 --no-dereference "$1:0" /home/oa-candidate/work
printf 'Candidate cgroup empty; private collection ownership transferred\n'
