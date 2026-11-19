# 47. Owner validation on a same-source arm64 image

- Status: Accepted (isolated-vm removed by ADR 0052)
- Date: 2026-11-18

## Context

ADR 0045 moved the full storage validation of a formal cutover from the 2-vCPU host to the owner machine, running "the candidate image". The deployed image is linux/amd64, but the owner machine is aarch64. Its x86 emulator, FEX, is dynamically linked against the host's arm64 loader and libraries, which an amd64 container does not contain. No amd64 container starts there: the rehearsal for v0.12.14 failed with `exec /usr/local/bin/node: no such file or directory`. v0.12.14 therefore used host validation (`--full-maintenance`) with about 25 minutes of downtime. The daily Owner-local Backup failed for the same reason, and it also looked up the host's containerd image ID in the owner's classic image store, where the same image has another ID. Issue #1817 records the measurements.

## Decision

- **Validator Image.** The owner validates with a linux/arm64 build of the same fixed source, built on the owner machine by `scripts/release/validator-image.ts`.
  - The build runs in the recorder's candidate isolation: a disposable UID 61000, its own rootless Docker, no credentials, and the owner-local lock.
  - It uses the GitHub producer's BuildKit script with only the platform changed.
  - After teardown the owner checks the archive and loads it. It then checks the image's arm64 identity, source label, channel, hosted frontend and native modules, and records a private receipt.
  - GitHub CI and the deployed image are unchanged.
- **Cutover.**
  - `deploy-backend.sh` reuses or builds the validator image before the image export and any backend contact.
  - If the image cannot be obtained, the release stops there, while the old application still serves, and names `--full-maintenance`. It never falls back to host validation by itself.
  - The owner rechecks the receipt right before validating.
- **Binding.**
  - The report keeps `image`, the deployed linux/amd64 image that the host requires, and adds `validatorImage` and `validatorPlatform: linux/arm64`.
  - The host accepts only a report that carries both and every earlier binding: nonce, source build, candidate SHA, capture time and dump digest. Sealing keeps both images in the manifest.
  - After migration the host still runs the counted live check with the deployed image, and its seven counts must equal the report. This is the cross-architecture backstop.
- **Daily Owner-local Backup.**
  - Each snapshot is validated with the validator image of its `sourceBuildId`, reused or built.
  - The host's native image ID stays the recorded binding and is never looked up locally.
  - Without a validator image the day's validation fails and writes nothing.

## Consequences

- **Architecture differences.** The validation runs the same source on another architecture. Behaviour differences in native dependencies (PostgreSQL client, isolated-vm, canvas) are accepted; the amd64 counted live check bounds what such a difference could hide.
- **Trust.** The validator image's trust is the owner's: the host verifies its binding, not its provenance. The provenance evidence stays in the owner's receipt.
- **Cost.** The first cutover or daily backup for a new source builds the image, about 2.5 minutes, before any downtime. On the v0.12.14 source, validating a real capture took 72–74 s, against more than 20 minutes of host validation during the outage.

## Alternatives

- **A static qemu-user emulator.** It would compete with FEX for the x86_64 binfmt registration on the owner's workstation and run the validation emulated, with no measured bound against the 15-minute report deadline.
- **arm64 builds on GitHub.** QEMU cross-builds of the native modules are slow, and native arm64 runners would break the fixed `ubuntu-latest` rule.
- **An x86_64 owner machine.** None is available.
