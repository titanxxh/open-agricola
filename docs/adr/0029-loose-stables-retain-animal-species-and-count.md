# 29. Loose stables retain animal species and count

- Status: Accepted
- Date: 2026-10-17

## Context

Issue #1267. Loose-stable storage kept only a species per farm position. When cards such as E012 Animal Bedding or C089 Stable Master raised one stable's capacity above one, a confirmed assignment of two or three animals lost its count on write-back while resource totals kept the submitted counts, forcing another reorganization.

## Decision

- Each occupied physical loose stable stores one `{ animalType, animalCount }` assignment in `stableAnimals` at its position key: one enabled species and a positive integer count. Empty assignments are omitted; `stableTiles` still owns the stable's existence. Capacity comes from the current rule query and is never stored as the assignment quantity.
- Reorganization, zone queries, payment, capacity enforcement, prefill, scoring, serialization and recovery consume the same assignment. Animal-number rules sum `animalCount`; presence, occupied-space and distinct-species rules keep their meanings.
- Removing animals decrements the count and removes the entry only at zero. Reducing capacity keeps resource totals until the player places or discards displaced animals through reorganization.
- The frontend renders the backend's stable count and capacity and submits through the existing reorganization command; it adjudicates no card rule. Completing an unrelated continuation never repairs a lost count or certifies an assignment.
- Room-holder permissions and mixed-species card-holder rules keep their own contracts (ADR 0026).

## Consequences

- A legal assignment survives write / read, response, handoff and recovery with inventory and assigned counts consistent.
- No migration for old species-only saves is provided.

## Alternatives considered

- Parallel species and count maps: two structures to keep consistent.
- Storing stable animals in a card's state, or inferring allocation from totals: loses physical holder identity.
