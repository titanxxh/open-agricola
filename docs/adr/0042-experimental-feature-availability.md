# 42. Experimental feature availability belongs to account entry points

Date: 2026-11-08
Status: Accepted

## Context

New product capabilities need a small invited testing group while ordinary releases continue. Team and Multihand creation is the first Experimental Feature. Account eligibility must not become game state or a rule variation.

## Original decision

- `shared/contract/experimental-features.ts` is the single declaration of named features and their Availability Stage. Stages are code constants changed through a PR and release. `off` denies every account, including administrators; `beta` permits Beta Access and administrators; `general` permits every logged-in account. Anonymous visitors always fail.
- `server/experimental-features.ts` reads current account qualification at every entry check. Administrators derive from `ADMIN_USERS`. Migration 036 stores one Beta Access grant per account, its grantor and timestamp. Account deletion cascades; grantor deletion clears the grantor.
- Production always uses declared stages. Nonproduction defaults to `general`; `DEV_EXPERIMENTAL_FEATURES=declared` restores declarations for development and tests. Production ignores development overrides.
- Feature IDs and stages never enter Room snapshots, `GameState`, Replay, results or database records. Only account qualification is stored. `/api/auth/me` supplies computed `experimentalFeatures` to the client.
- Creation gates belong to Room and HTTP entry points. Rematch checks its proposer both when proposed and when unanimously accepted. Completed-game `newGame` checks its caller. Public lobby discovery filters unavailable Team rooms in both in-process and distributed listings.
- Invitations and direct links retain existing login, Room and spectator authorization. Eligibility changes never stop an existing waiting or playing Room. Replay, result archives and personal game lists remain readable under their ordinary policies. The engine and `GameSession` do not know about availability.
- Rejections use `experimental_feature_unavailable` and the feature ID; HTTP returns 403. A rejected operation does not advance Room version or Replay.

## Graduation

A separate PR changes a stage to `general`. After at least one released version, the owner may remove that feature declaration, entry checks and obsolete UI. New features require declaration, entry-point denial and non-triggering tests, and an explicit graduation cleanup review.

## Superseding prerelease policy (2026-11-11)

[PRD #1655](https://github.com/titanxxh/open-agricola/issues/1655) and its accepted identity/access decisions supersede this ADR's invitation exemption and continuing-participation policy for the independent prerelease environment. The original decision above records the earlier main-based feature rollout; it does not authorize an environment-gate bypass.

- Formal remains the account and Beta authority, including administrator qualification. Pre has no independent registration, password or OAuth identity. Its local identity is a minimal read-only projection with the same user ID.
- One-minute, one-use handoffs bind the browser S256 challenge, source formal login, configured target and exact formal return root. Only the target's restricted service key may exchange or inspect its associations. Pre must use a different hostname from both configured formal frontend and API, including across ports. Formal credentials never cross this boundary; missing configuration or the default-false `PRERELEASE_ENTRY_ENABLED` keeps entry/issuance/exchange closed while configured cleanup endpoints remain available.
- Pre sessions last no more than seven days or the original source deadline. Successful formal confirmation supplies an absolute freshness deadline of at most 30 seconds, including transit; failed checks do not extend it, and known invalid state applies immediately.
- Formal current logout invalidates only associations from that source login. All-session revocation and password reset cover every source for the account. Durable events and idempotent target acknowledgements record completion. Formal account deletion remains pending until the target confirms local cleanup/anonymization.
- Every pre participant, invitee, spectator and archive reader needs current Beta access. Expired unknown state pauses access; qualification loss stops access while retaining game state. No development override, invitation or static Viewer grants an exception. Environment enforcement belongs to the pre implementation, not the rule engine.

- Migration 039 uses the owner data-generation UUID. Only a formal administrator may close admission, acknowledge verified projection erasure, or prepare/open its replacement. Immutable operation receipts fence stale retries. Erased generations do not create future cleanup obligations after the target is removed.
- Restoring a backup must rebind every retained identity to current deletion propagation without restoring source or local login rights. The required pre-native identity view, actual cleanup/remap/rescan, current formal deletion facts and a completion under 30 seconds gate activation. Missing/unknown refs block; the target key cannot authorize this audit. Close invalidates the earlier audit.

`server/prerelease-authority{,-routes}.ts`, migrations 037/039 and `shared/contract/prerelease-identity.ts` implement the formal authority seam. This does not establish a live pre deployment or complete its environment admission; those remain separate dependency tickets. Main removes the Team/Multihand/cooperation business under #1661, including the named feature registry, stages and its game entry checks. Beta qualification, administrator grant controls, formal identity authority and prerelease entry remain on main. The original registry and graduation sections above are historical; a hidden control or an `off` stage does not satisfy this removal.

## References

- [PRD #1615](https://github.com/titanxxh/open-agricola/issues/1615)
- [Beta qualification contract](../architecture/contract.md#beta-qualification)
- [Qualification tests](../../server/__tests__/experimental-features.test.ts)
- [Main transport boundaries](../../server/connection/__tests__/experimental-feature-transport.test.ts)
