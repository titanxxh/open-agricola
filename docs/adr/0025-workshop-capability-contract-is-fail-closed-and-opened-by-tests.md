# 25. Workshop Capability Contract is fail-closed and opened by fixed tests

- Status: Accepted
- Date: 2026-10-10

## Context

The listener action allowlist only fed the generation prompt and its sync check, so a custom flow could dispatch an unlisted native action. PR #1053 tried to open every serializable native mechanism at once (45 hooks, 31 listener identities, 25 leaf actions) with a host-side mirror of native semantics and changes to about 50 native files; ten review rounds kept finding admitted values whose native meaning differed, and it closed unmerged.

## Decision

- The Workshop Capability Contract is the one scope shared by model generation, source admission and execution. Execution is narrowed to the contract: custom declarations and runtime results outside it are rejected before authoritative settlement, and native rule paths are not changed to make a custom capability safe.
- A name belongs to the contract only while a fixed behavior test drives it through a two-player GameSession on unmodified native paths. New capabilities open in demand-driven slices, each with its own issue and test; anything not listed is closed. Candidate capabilities are tracked in a GitHub issue; the sandbox reference lists only open names.
- **Admission checks only**: the listed names (effect hooks, listener actions, phases, scopes, leaf actions, `special-effect` kinds, declared resource names and interaction kinds); the listener and flow-node fields a card may set, the types of open control fields (`optional`, `promptKey`, `anytimeWindow`, `actionContext.targetPlayerId`, `actionContext.trueAction`), and that every listener, node and animal zone belongs to the card itself; the types of declared metadata and listener data fields; each action's documented parameter keys and the types of native farm and card action parameters and `emit-choice` options; card-local `special-effect` field types; and the top-level type of a query result.
- Admission fixes the meaning of custom `reap` (a field phase outside Harvest) and `breed` (breeding sourced by the card) by writing that context onto the leaf; a card cannot write it. Native-action leaves are admitted only as flow leaves, not as replacement `actionId`s or `followUpActions`.
- Admission does not mirror native validation of other values, costs, schedules or query contents; native consumers validate them as they do for native cards. Review findings of that kind are answered by this ADR.
- Admission serves honest authors and model mistakes with a clear error; it does not bound adversarial workloads beyond the isolate's time and memory limits.
- Threat model: only reviewed, approved and live snapshots reach other players; unreviewed cards run only in their author's sandbox, and the isolate bounds memory, time and access. During command settlement, a first hook failure or out-of-contract result rejects and rolls back the command; a repeated identical failure skips that card's effect. A failure outside a command records a card warning and contributes a neutral result.

## Consequences

- More requests receive an explicit capability-gap answer instead of an admitted card that behaves incorrectly.
- Native defects found while opening capabilities are fixed separately, with a failing test that uses an official card.

## Alternatives considered

- Opening the whole serializable surface at once: no finite completion condition for the audit.
- Constraining only the prompt: accepted source and executed behavior would differ.
