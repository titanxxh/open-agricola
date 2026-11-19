"""Build a registry-only pnpm fetch plan. No project scripts/config enter the networked container."""
import base64
import json
import re
from pathlib import Path

import yaml


def fetch_plan(lock):
    packages = {}
    dependencies = {}
    for key, entry in lock["packages"].items():
        if not re.fullmatch(r"(?:@[a-zA-Z0-9_.-]+/)?[a-zA-Z0-9_.-]+@[0-9][a-zA-Z0-9.+-]*", key):
            raise ValueError(f"unsupported registry package identity: {key}")
        resolution = entry["resolution"]
        integrity = resolution.get("integrity", "")
        if set(resolution) != {"integrity"} or not integrity.startswith("sha512-"):
            raise ValueError(f"expected a registry integrity pin for {key}")
        if len(base64.b64decode(integrity[7:], validate=True)) != 64:
            raise ValueError(f"invalid integrity for {key}")
        packages[key] = {"resolution": {"integrity": integrity}}
        dependencies[f"oa-input-{len(packages)}"] = {"specifier": f"npm:{key}", "version": key}
    return {
        "lockfileVersion": "9.0",
        "settings": {"autoInstallPeers": True, "excludeLinksFromLockfile": False},
        "importers": {".": {"dependencies": dependencies}},
        "packages": packages,
        "snapshots": {key: {} for key in packages},
    }


if __name__ == "__main__":
    lock = yaml.safe_load(Path("/inputs/pnpm-lock.yaml").read_text())
    if lock.get("lockfileVersion") != "9.0":
        raise ValueError("unsupported pnpm lockfile format")
    plan = fetch_plan(lock)
    Path("pnpm-lock.yaml").write_text(yaml.safe_dump(plan))
    Path("package.json").write_text(json.dumps({"private": True}))
