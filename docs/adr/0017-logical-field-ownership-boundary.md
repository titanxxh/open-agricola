# Logical Field is the card-facing field boundary

- Status: Accepted
- Date: 2026-09-02

## Context

Farmyard Fields are owned by `PlayerState.fields`, while Card Fields are owned by played cards in `cardStates`. Card implementations previously read the first storage directly and manually appended the second in selected paths. Identical Field rules therefore differed in counts, sowing, mutation, events, and Harvest evidence, and multi-slot Card Fields could lose stable selection identity when compacted.

## Decision

A Logical Field is the non-geometric rule identity. It includes every Farmyard Field and every registered played Card Field, including empty fixed-capacity Card Field slots. A Card Field remains one Logical Field regardless of slot capacity and remains owned by Card State.

Card-facing code reads immutable projections through `getLogicalFields()` by default. Rules about plowing, fencing, adjacency, board occupancy, or Field tiles use `getFarmyardFields()` explicitly. All card-facing writes use the named operations returned by `mutateLogicalFields()`; the module validates first and persists through the owning adapter. Its internal Farmyard adapter is the only Card Impl code that may access `PlayerState.fields` directly.

Farmyard and Card Field crops use the same `reap` action. Harvest Count calculation, resources, summaries, events, listeners, and Card Field owner callbacks are derived from that one execution. A static AST gate scans production official, Farmers of the Moor, major, community, and helper sources and rejects property or bracket access named `fields` through any receiver, with no migration allowlist.

## Consequences

Non-geometric Field rules include Card Fields without per-card composition. Geometry never gives Card Fields physical farmyard occupancy. Fixed slots preserve deterministic identity across removal, replay, and restoration. New Card Impls must make the Logical Field or Farmyard Field interpretation visible in code, and shared Reap behavior cannot split by storage owner.

The rejected alternatives were moving Card Fields into farmyard storage, retaining opt-in composition helpers, or permitting a migration allowlist. They respectively invent geometry and lifecycle coupling, preserve the original omission risk, or leave an unreviewable bypass.
