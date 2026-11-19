# 50. Rules code does not assume a single Card Edition

- Status: Accepted
- Date: 2026-11-19

## Context

ADR 0049 makes the Card Edition a setup choice: a game deals revised or classic occupations and minor improvements, never both. That rule lives in setup and admission only. Nothing else enforces it. Lookups by ID find cards of either edition, dev draw and the sandbox can put any card into any game, and a later product option could mix decks.

The editions also differ on rules that look global. A multi-stack Card Field is one field for revised cards and several for some classic cards. A temporary person is a Supply Person from the player's own supply in revised cards and a Guest from the general supply in classic ones.

## Decision

- The edition recorded in game state (ADR 0049) serves setup, the deal pool and display. Rules code never reads it: no action, hook, scoring rule or shared mechanism branches on the edition of the game.
- Each card declares where its edition differs, through its definition metadata, its own implementation or a capability it opts into. Shared mechanisms take their behavior from those declarations.
- Every card and every shared mechanism stays correct when cards of both editions are in the same game.
- Capability and identity metadata covers the equivalent cards of both editions.
- A new or changed shared mechanism has at least one Session test in which a classic card and a revised card that both touch it are in the same game. A single card does not need one.
- The constraint covers rules and state. Setup, the encyclopedia and the display of same-named cards stay separated by edition under ADR 0049.

## Consequences

- An edition-specific rule costs a per-card declaration instead of a global switch. ADR 0017's single Logical Field per Card Field stays the default; a classic card that counts as several fields declares it.
- Mixed play needs no rules change if a product option later allows it. Dev draw and the sandbox already produce it.
- Reviewers reject conditionals on the game's edition in rules code.

## Alternatives considered

- Branching shared rules on the stored edition: fewer per-card declarations, but every shared rule grows two code paths and any game that holds cards of both editions is undefined.
- Relying on setup to keep editions apart: shared mechanisms stay free to assume one edition, which already breaks under dev draw and would break under any later mixing option.
