#!/usr/bin/env bash
# Trusted runner setup only. Candidate code never runs in this shell.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_OS:-} == Linux && $EUID == 0 ]] || { echo 'Requires disposable Linux GitHub runner setup' >&2; exit 1; }
source_directory="$(realpath "$1")"
policy_directory="$(realpath "$2")"
node_binary="$(realpath "$3")"
runner_uid="$4"
[[ $node_binary == /opt/hostedtoolcache/node/*/bin/node && $runner_uid =~ ^[0-9]+$ && ${RUNNER_TEMP:-} == /home/runner/work/_temp ]] || exit 1
# Keep policy, dependencies, canonical Git, and runner command files outside the candidate UID.
chmod 700 /home/runner "$RUNNER_TEMP"
install -d -m 755 /run/oa-ci-isolation
install -d -m 700 -o "$runner_uid" -g root "$RUNNER_TEMP/candidate-isolation"
[[ ! -e /home/oa-candidate ]] || { echo 'Candidate identity already exists' >&2; exit 1; }
# Docker >=29.5 is required for real rootless --network host loopback.
# Packages and their checksums are authenticated by Docker's signed apt repository.
install -d -m 755 /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /run/oa-ci-isolation/docker.asc
fingerprint="$(gpg --show-keys --with-colons /run/oa-ci-isolation/docker.asc | awk -F: '$1=="fpr" && !found { first=$10; found=1 } END { print first }')"
[[ $fingerprint == 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 ]] || exit 1
install -m 644 /run/oa-ci-isolation/docker.asc /etc/apt/keyrings/docker-isolation.asc
. /etc/os-release
printf 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker-isolation.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker-isolation.list
apt-get update -qq
version="$(apt-cache madison docker-ce | awk '$3 ~ /^5:29\.9\.3-/ && !found { first=$3; found=1 } END { print first }')"
[[ -n $version ]] || { echo 'Pinned rootless Docker29.9.3 unavailable' >&2; exit 1; }
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends uidmap dbus-user-session docker-ce="$version" docker-ce-cli="$version" docker-ce-rootless-extras="$version"
# The official /usr/bin/rootlesskit path has the packaged AppArmor userns profile.
[[ -x /usr/bin/rootlesskit && -f /etc/apparmor.d/rootlesskit ]] || exit 1
apparmor_parser -r /etc/apparmor.d/rootlesskit
useradd --uid 61000 --user-group --create-home --shell /bin/bash oa-candidate
chmod 700 /home/oa-candidate
# useradd allocates non-overlapping subordinate IDs using the host account database.
grep -q '^oa-candidate:' /etc/subuid
grep -q '^oa-candidate:' /etc/subgid
cp -a "$source_directory" /home/oa-candidate/work
chown -R 61000:61000 /home/oa-candidate
install -m 644 "$policy_directory/scripts/ci/candidate-isolation-smoke.ts" /run/oa-ci-isolation/smoke.ts
printf 'trusted inert marker\n' > /run/oa-ci-isolation/protected-marker
chmod 644 /run/oa-ci-isolation/protected-marker
# The daemon needs newuidmap/newgidmap before payloads get NoNewPrivileges.
loginctl enable-linger oa-candidate
systemctl start user@61000.service
runuser -u oa-candidate -- env HOME=/home/oa-candidate PATH=/usr/bin:/bin XDG_RUNTIME_DIR=/run/user/61000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/61000/bus /usr/bin/dockerd-rootless-setuptool.sh install --force
"$node_binary" --input-type=module - "$node_binary" "$RUNNER_TEMP/candidate-isolation" <<'NODE'
import {writeFileSync} from 'node:fs';
const [node, privateDirectory] = process.argv.slice(2);
writeFileSync('/run/oa-ci-isolation/context.json', JSON.stringify({uid:61000,gid:61000,home:'/home/oa-candidate',work:'/home/oa-candidate/work',socket:'/run/user/61000/docker.sock',node,privateDirectory}), {mode:0o644,flag:'wx'});
NODE
