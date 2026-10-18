# 23. Card-owned state has explicit contributions, visibility and presentation

- Status: Accepted
- Date: 2026-10-06

## Context

Shared rule paths recognized individual cards and interpreted their private storage, card-local internal state was sent to viewers by default, and anytime window permissions were inferred from prompt keys.

## Decision

- **Ownership**: card-local state stays owned by its Card Source. Shared rule paths consume deterministic, read-only Card Rule Contributions (supply usage, standing special stables, scoring adjustments) through generic aggregation instead of recognizing cards or reading their storage. Pure farmyard geometry consumes computed generic inputs.
- **Visibility**: card state is internal by default, even for its owner. Card State distinguishes internal storage, explicitly public facts and explicitly player-private information, which belongs to the storing player. Every viewer projection (snapshots, events, history, Bug Report evidence) exposes only the declared public and own private information, and an internal or private write never leaks through a public event.
- The complete authoritative state stays available for rules, recovery, undo and Replay recording; this decision never deletes private values from recovery or Replay storage. A completed Replay seat perspective shows that player's view; the all-open perspective may show the full recorded state (ADR 0010, ADR 0011).
- **Presentation**: dynamic Card State Presentation is structured generic data contributed by the owning card and derived from authoritative state; renderers never recognize card IDs.
- **Anytime windows** are explicit properties of the current waiting interaction, not meanings of prompt keys, and are not inherited by nested choices. Shared Session policy consumes the generic window data without knowing which card supplied it.
- Architecture checks cover single-card state dependencies and card-prompt branches in shared rules, sessions, projections, server and frontend code, with only narrow, reasoned exceptions for legitimate metadata and declarative printed targets. The checks use ordinary repository syntax and source discovery, not whole-program dataflow analysis.

## Consequences

- A card author cannot forget to hide a field: hiding is the default.
- Shared paths and the frontend carry no per-card interpretation of private state.

## Alternatives considered

- Moving card facts into shared writable summaries: spreads state ownership.
- Default-public fields with per-card hiding: keeps the omission risk.
- Frontend branches that interpret card fields, prompt-key authorization, or a migration baseline for existing dependencies: keep rules coupled to card identity and text.
