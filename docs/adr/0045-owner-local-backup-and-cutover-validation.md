# 45. Owner-local backup and cutover validation

- Status: Accepted; the image that runs Owner-local Validation is amended by [ADR 0047](0047-owner-validation-on-a-same-source-arm64-image.md)
- Date: 2026-11-17

## Context

A formal backend release stopped the API for 28–32 minutes (v0.12.10, v0.12.12). About 29 of those minutes went to two full storage validations on a 2-vCPU host. Each one decoded every retained Replay Step on one thread: the isolated restore of the pre-deployment backup, then `check-live` on the migrated production data. The time grows with retained replays. The owner machine has many more cores and already drives every release. Issue #1731 records the measurements and the agreed design.

## Decision

- **Owner-local Backup.** Every day after the host's daily backup, the owner machine asks the host for one online capture and pulls it into `~/oa-backup/<UTC capture time>/`.
  - The capture is snapshot-consistent and uses the existing online capture protection. It contains an uncompressed directory-format dump, the content-addressed objects and the current deletion ledger.
  - rsync uses the previous copy as its basis, so it transfers only what changed.
  - The host keeps at most one transient owner capture. A pull removes it, the next capture supersedes it, and daily pruning removes a stale one.
  - The copy holds formal data only, never configuration or credentials, and stays private to the owner.
  - Copies are kept at most 30 days, including the newest (ADR 0010). Every restore applies the current deletion ledger first.
- **Owner-local Validation.** The owner machine restores each copy into throwaway local services and runs the full storage validation in the image the host was running. It decodes replays on every CPU.
  - This adds to the host's daily backup, its host validation and its offsite copy; it does not replace them (ADR 0040). Offsite synchronization does not wait for the owner machine.
- **Archive version 2.** An archive may hold a directory-format dump bound by per-file digests and one digest over the file list. Restore accepts versions 1 and 2. Sealed host archives stay version 1.
- **Cutover validation.**
  1. A formal release stops the source and takes the Cutover Backup in directory form.
  2. The owner machine pulls the delta, then restores and validates it with the candidate image.
  3. The host accepts only a report bound to the dump digests, the candidate SHA and the image digest. It then migrates, applies the current deletion ledger, checks that the migrated counts match the report, and starts.
  4. Without a usable report the cutover blocks; `--full-maintenance` keeps the host-only flow. A report missing its deadline before migration restarts the identical source and voids the operation.
  5. A source or target image without these capabilities uses the host-only flow.

## Consequences

- The fast release path depends on the owner machine. When it is unavailable, the release falls back to the slower host-only flow; it never skips validation.
- Production data lives on the owner machine under the same 30-day and deletion rules as other backups.
- A capability shipped in an image can be used only from the release after the one that ships it.
- Measured on production data: the uncompressed dump takes 12–14 s and a 26-minute delta transfers in 7 s. A local restore takes 8 s. A 16-worker validation takes 23 s, against 258 s on one thread.

## Alternatives

- **PostgreSQL physical replication.** It would replicate the shared cluster, including prerelease and scratch databases. A replication slot would grow host WAL while the owner machine is off, and the owner machine would have to run a standby.
- **Logical replication.** It needs a restart of the shared cluster to change `wal_level`, and every migration would have to be coordinated because DDL does not replicate.
- **Changing the sealed tgz archive.** The outer compression defeats rsync. Readers and writers run in different images, so the change needs two releases. Offsite, retention and maintenance consumers would also need new rules.
