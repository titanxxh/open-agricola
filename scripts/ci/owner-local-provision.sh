#!/usr/bin/env bash
# One-time, idempotent owner-machine provisioning for owner-local candidate verification (#1779).
# Run as root from the trusted main checkout: sudo bash scripts/ci/owner-local-provision.sh <node-install-dir>
# It installs rootless Docker extras matching the installed Docker Engine, the user-namespace tools, a root-owned
# copy of the trusted Node toolchain and the browser system libraries. Candidate code never runs here.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 && $# == 1 ]] || { echo 'Usage: sudo bash scripts/ci/owner-local-provision.sh <node-install-dir>' >&2; exit 1; }
policy="$(realpath "$(dirname "$0")/../..")"
source_node="$(realpath "$1")"
[[ -x $source_node/bin/node && -x $source_node/bin/corepack ]] || { echo 'Node install directory lacks bin/node and bin/corepack' >&2; exit 1; }
. /etc/os-release
[[ $ID == ubuntu ]] || { echo 'Owner-local isolation is provisioned for Ubuntu hosts' >&2; exit 1; }

# Rootless extras must match the installed engine exactly; this script never upgrades Docker itself.
engine="$(dpkg-query -W -f='${Version}' docker-ce)"
[[ -n $engine ]] || { echo 'docker-ce is not installed' >&2; exit 1; }
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends acl uidmap dbus-user-session "docker-ce-rootless-extras=$engine"
# The packaged profile lets rootlesskit create user namespaces under Ubuntu's AppArmor userns restriction.
[[ -x /usr/bin/rootlesskit && -x /usr/bin/dockerd-rootless-setuptool.sh && -f /etc/apparmor.d/rootlesskit ]] || { echo 'rootless Docker extras are incomplete' >&2; exit 1; }
apparmor_parser -r /etc/apparmor.d/rootlesskit

# A root-owned copy of the trusted toolchain: candidates execute it but cannot change it.
version="$("$source_node/bin/node" --version)"
[[ $version =~ ^v(24\.(1[5-9]|[2-9][0-9])|2[6-9]|[3-9][0-9])\. ]] || { echo "Unsupported Node $version" >&2; exit 1; }
target="/opt/oa-owner-local/node-$version"
if [[ ! -d $target ]]; then
  install -d -m 755 /opt/oa-owner-local
  staging="$(mktemp -d /opt/oa-owner-local/.node-XXXXXX)"
  cp -a "$source_node/." "$staging/"
  # A globally installed pnpm would bypass the candidate's packageManager pin; Corepack provides it instead.
  rm -rf "$staging/bin/pnpm" "$staging/bin/pnpx" "$staging/lib/node_modules/pnpm"
  chown -R root:root "$staging"; chmod -R go-w "$staging"; chmod 755 "$staging"
  mv "$staging" "$target"
fi
ln -sfn "$target" /opt/oa-owner-local/node
# The pnpm shim resolves the candidate's packageManager pin through Corepack, as on GitHub runners.
/opt/oa-owner-local/node/bin/corepack enable --install-directory /opt/oa-owner-local/node/bin

# Browser system libraries come from the trusted checkout's Playwright, as in the CI prerequisite step.
[[ -f $policy/node_modules/playwright/cli.js ]] || { echo 'Install trusted dependencies in the policy checkout first' >&2; exit 1; }
playwright=(/opt/oa-owner-local/node/bin/node "$policy/node_modules/playwright/cli.js")
# install-deps always refreshes apt lists; skip it when nothing is missing.
if [[ "$("${playwright[@]}" install-deps --dry-run chromium webkit firefox)" != 'All system dependencies are installed.' ]]; then
  "${playwright[@]}" install-deps chromium webkit firefox
fi
# Trusted browser cache for the trusted Playwright version; each run copies it into the disposable candidate home.
PLAYWRIGHT_BROWSERS_PATH=/opt/oa-owner-local/ms-playwright "${playwright[@]}" install chromium webkit firefox
chmod -R go-w /opt/oa-owner-local/ms-playwright
printf 'Provisioned rootless Docker %s, Node %s at %s\n' "$engine" "$version" "$target"
