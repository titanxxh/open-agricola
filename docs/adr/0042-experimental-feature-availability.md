# 42. Experimental feature availability belongs to account entry points

Date: 2026-11-08
Status: Accepted

## Context

New product capabilities need a small invited testing group while ordinary releases continue. Team and Multihand creation is the first Experimental Feature. Account eligibility must not become game state or a rule variation.

## Decision

- `shared/contract/experimental-features.ts` is the single declaration of named features and their Availability Stage. Stages are code constants changed through a PR and release. `off` denies every account, including administrators; `beta` permits Beta Access and administrators; `general` permits every logged-in account. Anonymous visitors always fail.
- `server/experimental-features.ts` reads current account qualification at every entry check. Administrators derive from `ADMIN_USERS`. Migration 036 stores one Beta Access grant per account, its grantor and timestamp. Account deletion cascades; grantor deletion clears the grantor.
- Production always uses declared stages. Nonproduction defaults to `general`; `DEV_EXPERIMENTAL_FEATURES=declared` restores declarations for development and tests. Production ignores development overrides.
- Feature IDs and stages never enter Room snapshots, `GameState`, Replay, results or database records. Only account qualification is stored. `/api/auth/me` supplies computed `experimentalFeatures` to the client.
- Creation gates belong to Room and HTTP entry points. Rematch checks its proposer both when proposed and when unanimously accepted. Completed-game `newGame` checks its caller. Public lobby discovery filters unavailable Team rooms in both in-process and distributed listings.
- Invitations and direct links retain existing login, Room and spectator authorization. Eligibility changes never stop an existing waiting or playing Room. Replay, result archives and personal game lists remain readable under their ordinary policies. The engine and `GameSession` do not know about availability.
- Rejections use `experimental_feature_unavailable` and the feature ID; HTTP returns 403. A rejected operation does not advance Room version or Replay.

## Graduation

A separate PR changes a stage to `general`. After at least one released version, the owner may remove that feature declaration, entry checks and obsolete UI. New features require declaration, entry-point denial and non-triggering tests, and an explicit graduation cleanup review.

## References

- [PRD #1615](https://github.com/titanxxh/open-agricola/issues/1615)
- [Contract](../architecture/contract.md#experimental-features)
- [Entry-point tests](../../server/connection/__tests__/experimental-features.test.ts)
