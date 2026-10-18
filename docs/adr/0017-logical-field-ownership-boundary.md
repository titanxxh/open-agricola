# 17. Logical Field is the card-facing field seam

- Status: Accepted
- Date: 2026-09-02

## Context

Farmyard Fields are owned by `PlayerState.fields`, Card Fields by played cards in `cardStates`. Card implementations read the first directly and appended the second in selected paths, so identical Field rules differed in counts, sowing, mutation, events and Harvest evidence, and multi-slot Card Fields lost stable identity when compacted.

## Decision

- A Logical Field is the non-geometric rule identity. It includes every Farmyard Field and every registered played Card Field, including empty fixed-capacity slots. A Card Field is one Logical Field regardless of capacity and stays owned by Card State.
- Card-facing code reads immutable projections through `getLogicalFields()`. Plowing, fencing, adjacency, board occupancy and Field-tile rules ask for `getFarmyardFields()` explicitly.
- All card-facing writes use the named operations from `mutateLogicalFields()`, which validate first and persist through the owning adapter. The internal Farmyard adapter is the only Card Impl code that touches `PlayerState.fields`.
- Farmyard and Card Field crops share the `reap` action and derive Harvest Count, resources, summaries, events, listeners and owner callbacks from one execution.
- A static AST gate rejects any `fields` property or bracket access in production official, Moor, major, community and helper sources, with no allowlist.

## Consequences

- Non-geometric rules include Card Fields without per-card composition, and geometry never gives Card Fields farmyard occupancy.
- Fixed slots keep deterministic identity across removal, Replay and restoration.
- New Card Impls make the Logical Field or Farmyard Field interpretation visible in code, and shared Reap behavior never splits by storage owner.

## Alternatives considered

- Moving Card Fields into farmyard storage: invents geometry and lifecycle coupling.
- Opt-in composition helpers: keep the original omission risk.
- A migration allowlist: leaves an unreviewable bypass.
