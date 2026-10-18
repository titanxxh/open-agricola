# 10. Completed replays are public shared records with erasure tombstones

- Status: Accepted
- Date: 2026-07-26

## Context

A permanently public Replay with seat and all-open perspectives keeps hands, choices and custom-card content for a long time. Identity display, account deletion, content takedown, GitHub Issues and backup restoration need fixed rules before such records exist.

## Decision

- A normal completion produces a separate Game Result Archive and Game Replay Archive. The Replay is public at the original `roomId` with every seat perspective and an all-open perspective. Replay Steps correspond only to accepted commands and explicit choices, never internal action leaves.
- A Replay Participant shows only the recorded display name and `playerIndex`; the site `userId` is an internal association. Deleting an account does not delete the shared record: the seat becomes "Deleted player (seat N)" and the internal association and name are cleared.
- A seat perspective replays what that player could see; the all-open perspective shows every hand, draft, parent choice and submitted answer. The archive keeps no raw Private Events, private prompts, transient notifications or transport envelopes.
- Only live, reviewed custom cards enter formal multiplayer games, so their Replay Card Snapshot is public by publication; unreviewed cards stay in the Workshop Sandbox (ADR 0025). The earlier per-game consent prompt for unpublished cards was removed with that rule. The snapshot holds only visible name, text, art and rule parameters, never prompts, history, provenance or source.
- Erasure matrix:

| Trigger | Game Replay Archive | Game Result Archive | GitHub Issue |
|---|---|---|---|
| User or administrator account deletion | Keep rules data; anonymize the participant and clear the `userId` association | Keep seat and score; clear `userId` and name | Keep symptom, `playerIndex` and `roomId`; replace the body's `userId` with "deleted reporter" |
| Ordinary Workshop card deletion | Keep the confirmed public Replay Card Snapshot | Unchanged | Unchanged |
| Administrator takedown or violating content | Delete the whole payload and keep a Replay Tombstone; never redact step by step | Keep the anonymized scalar result | The repository owner edits or deletes as required |
| Legal request | Identity-only: anonymize as for deletion; content or whole record: delete the payload and keep a Tombstone | Keep the anonymized result unless whole-record deletion is requested | Remove site identity first; the repository owner deletes on request |

- A Replay Tombstone exposes only the original `roomId` and a coarse reason, and the `roomId` is never reused. When an online deletion returns, public endpoints have already stopped serving the data; backups keep copies at most 30 days, and every restore replays the deletion ledger before going live.
- `replay-assets/<sha256>` resources are shared and content-addressed. Ordinary deletion removes this Replay's references and deletes a resource only when no live Replay references it; a violating resource first turns every referencing Replay into a Tombstone. The ledger lists each affected `roomId` and resource hash.
- A GitHub author identity created by a personal submission is managed by GitHub and cannot be anonymized by the site, so connection and submission make this explicit.

## Consequences

- Participant identity is separate from the rules payload, so ordinary deletion only anonymizes metadata.
- Whole-record tombstones avoid missed copies and unplayable partially redacted records.
- The deletion ledger takes effect independently of restorable backups.

## Alternatives considered

- Letting a deleted participant remove the whole Replay: one player cannot destroy a shared record.
- Step-by-step redaction: cannot prove every copy is gone and may break playback.
- Keeping raw private events, prompts and custom-card source: the Replay needs only rule state, accepted choices and visible cards.
- Returning 404 or reusing the `roomId` after deletion: breaks the permanent identity.
