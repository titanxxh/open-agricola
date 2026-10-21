# ADR 0031: Explicit action-space use subscriptions

Status: Accepted

## Context

Board IDs previously doubled as listener action identities. Cards that refer to using a space also subscribed to internal `collect`, `gain` or `place-farmer` actions. Those identities cannot distinguish a complete space use from an individual rule action or a person placement. Issue [#1292](https://github.com/titanxxh/open-agricola/issues/1292) separates them, using card text to classify callers.

## Decision

- Native listeners select exactly one of `actions`, `actionSpaces`, `events` or `globalQuery`. `actionSpaces` accepts explicit `'all'` or nonempty authoritative board IDs, with `before`, `immediatelyAfter`, `after`, `isDoable` and `computeReplace`. Board IDs are no longer legal rule-action subscriptions. Workshop keeps its separately tested capability subset.
- Every actual complete space use has an explicit engine scope. Payment, choices, replacement bodies and mandatory subflows complete before the scope's completion windows. New placements carry their person-use receipt; movement and workerless use carry no new placement. Pure queries and placement-only effects do not complete a use.
- Space and rule identities remain distinct but share the existing reaction scheduler at the same completion. Immediate reactions finish before ordinary after reactions. A multi-step body keeps the ordering of its earlier rule completions.
- This phase priority applies within a completion boundary. Benefits that belong to the space's primary body, and reactions that must finish within an internal rule action, settle before the enclosing space completes. They do not enter the final completion pool merely because they run after an internal mutation. Ordinary after reactions keep their existing completion boundary.
- Resource provenance identifies the effect that supplies the goods. Native and card-provided spaces follow the same rule, including goods produced after choices or during a card-granted use. A shared space context, a granting card or primary-body membership alone is not proof of space origin: card reactions, own-play benefits and replacement rewards retain their own sources. An explicit repeat of the space's own option retains that option's space origin.
- Actual `place-farmer` wrappers keep their rule-action completion, including jump wrappers. Top-level and fixed-on-space placement synthesize only this action subscription in the common after pool; extra placement uses its real wrapper, and movement synthesizes none. Turn-limited cards use existing Turn Scope identity instead of cleanup reaction order. A rule-action modifier within a space retains its internal boundary when it must affect a later step of that same space. A whole-space redirect clears the selector context for the replacement rule action.
- Space sources are captured separately on entry to each phase. An immediate reaction can introduce a source for the next after phase. It cannot add a source to its current phase or replay a previously captured rule reaction. Handlers and doability checks continue to read current state.
- The private engine cursor owns scope progress and primary-body event receipts. No second event bus, public state counter or compatibility action alias is introduced.
- The production boundary gate scans every Card Source and expanded native registration, derives valid space IDs from board and card-space registries, and rejects shape, phase, target and coverage errors. Semantic candidates remain a review report, since legal rule actions can have space predicates. Both prepush and architecture checks run the same hard gate.

## Consequences

Card text determines whether a listener follows space use, person placement or a rule action. A single space can execute several rule actions while producing one space-use completion. Listeners from both domains can share a player-controlled trigger window. Private cursor recovery must preserve body membership, frozen rule reactions and phase progress.

Tests and implementation pointers are maintained in [Hooks, stage dispatch and listener purity](../architecture/hooks.md). The gate's invocation and report contract are in [CI checks](../operations/ci-checks.md).
