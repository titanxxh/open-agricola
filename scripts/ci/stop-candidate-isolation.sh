#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && ${1:-} =~ ^[1-9][0-9]*$ ]] || exit 1
# Stop the user manager first so candidate user units cannot restart descendants.
loginctl disable-linger oa-candidate
systemctl stop user@61000.service
candidate_cgroup=/sys/fs/cgroup/user.slice/user-61000.slice
if [[ -d $candidate_cgroup ]]; then
  printf '1\n' > "$candidate_cgroup/cgroup.kill"
  for attempt in {1..100}; do
    [[ ! -e $candidate_cgroup/cgroup.events ]] && break
    grep -q '^populated 1$' "$candidate_cgroup/cgroup.events" || break
    sleep 0.05
  done
  if [[ -e $candidate_cgroup/cgroup.events ]] && grep -q '^populated 1$' "$candidate_cgroup/cgroup.events"; then echo 'Candidate descendants remain active' >&2; exit 1; fi
fi
systemctl stop user-61000.slice
# Refuse collection if a process escaped the dedicated subtree or an account can restart it.
userdel oa-candidate
# Only after every candidate process is gone may the trusted collector read the tree.
chown --from=61000 --no-dereference "$1:0" /home/oa-candidate
chown -R --from=61000 --no-dereference "$1:0" /home/oa-candidate/work
printf 'Candidate cgroup empty; private collection ownership transferred\n'
