# 46. Prerelease rebind after a formal release

- Status: Accepted
- Date: 2026-11-17

## Context

Open pre admission is bound to the accepted formal build, so every formal release closes pre until fresh acceptance. After v0.12.13 (`5ffb71f8b`), pre stayed closed from 05:22Z with real Beta users, for three reasons:

- **The installed candidate lost its receipt.** `open` checks the candidate receipt against the verification configuration of the live protected main. The release changed only `tsconfig.storage-tools.json` among those files, yet the unchanged candidate `82b5bb38` lost its `open` eligibility. Reverifying in place would have needed a new 30–60 minute GitHub verification, with or without a policy change.
- **The scripted window needed a host policy change first.** The `window` driver needs host owner-tools at a SHA that contains it. The documented policy-change order also re-imported and redeployed the candidate.
- **The window itself was slow.** It took about 45 minutes, mostly browser suites run one engine after another; WebKit and Firefox flakes added reruns.

The owner operates every release alone and asked that whatever can run on the owner machine run there. Issue #1778 records the decisions; #1779 tracks the local verification harness.

## Decision

- **Installed receipt continuity.** `open` and `verify-open` of the installed candidate accept complete verification evidence from an earlier producer, after main changed its verification configuration.
  - The earlier producer must still be reachable from protected main. Native workflow runs and owner-local receipts both qualify.
  - Evidence from the current configuration is preferred.
  - A carried receipt names the current main SHA and configuration in `continuity`.
  - The host accepts a carried receipt only for `open`. `deploy`, `restore` and image production always require the current producer configuration.
  - `--strict-producer true` turns continuity off for `open` as well.
  - The evidence is re-read from GitHub each time; the host stores no receipt copy.
- **Policy phase in the scripted window.** An optional `policy` block runs the following inside the same closure:
  1. Move host owner-tools from `from` to `to`.
  2. Rebuild language packs when `i18n.ref` changed.
  3. Close and `maintain`.
  4. Import the trusted-policy image of `to`.
  5. Continue with `reverify`.

  No candidate import or deploy runs. A dependency or storage guard code change stops the phase until the owner confirms the host step.
- **Parallel engines.** Multi-engine suites run Chromium, Firefox and WebKit concurrently. Each engine uses its own kept A/B/C accounts, so the revocation case on one engine cannot sign out another.
- **Fast rebind.** When a formal release does not touch the identity boundary, the window runs only:
  - reverify, the audit chains, handoff and boundary;
  - the formal browser proof, open and readback.

  The remaining evidence is carried from the last full acceptance of the same candidate, image and generation. The rules for deciding:
  - A checked-in list of formal-side identity files decides, diffed from the formal build of the last full acceptance, not from the previous rebind.
  - The owner may acknowledge one exact diff hash.
  - A full acceptance older than seven days forces the full window.
- **Images stay on GitHub.** The owner machine is aarch64, and it cannot run amd64 containers. Candidate, trusted-policy and formal images keep the GitHub-hosted builder and its provenance. They are built as soon as their source is fixed, outside the closure.
- **Local verification becomes the default (#1779).** An isolated harness will run the complete candidate plan on the owner machine and record the existing owner-local receipts. Isolation uses a dedicated UID with its own rootless Docker, mirroring CI.
  - Pre and formal releases use the harness by default; GitHub verification remains the fallback.
  - Pre no longer waits for the comparison PR CI before `sync`. The owner already bypasses the prerelease status-check ruleset.

## Consequences

- A routine formal release closes pre for roughly the formal downtime, plus about 7 minutes for Pages and acceptance, plus about 11 minutes for a fast rebind. A policy upgrade adds about 6 minutes, which overlaps the Pages acceptance.
- Continuity trusts a candidate verified under an older producer definition. When main deliberately tightens verification, the owner must open with `--strict-producer true`, or deploy after a new verification.
- A fast rebind tests the identity boundary on the deployed formal build every time. Carried candidate-behaviour evidence can be at most seven days old.
- Six additional kept formal accounts exist only for acceptance.

## Alternatives

- **Manual C5 reverify.** Blocked by the same receipt check, and slower.
- **Persisting the install-time receipt in `gate.json`.** It would change retained runtime state without adding assurance, because the native evidence must be re-read anyway.
- **Local amd64 image builds.** They need QEMU binfmt on the owner machine, which would override the existing FEX handler, plus slow emulation. Restructuring the Dockerfile for cross-builds would still need emulation for the final stage.
- **Faster GitHub verification only.** Splitting `fast` into shards and weighting the Chromium shards remains in the #1779 backlog. Local verification removes the wait altogether.
