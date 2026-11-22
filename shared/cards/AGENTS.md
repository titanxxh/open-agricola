# Cards

One card per file. To implement or change a card, follow [`docs/CARD_AUTHORING.md`](../../docs/CARD_AUTHORING.md): its **Card contract** lists every rule a card keeps, and its later sections map card text to mechanisms, example cards and tests.

## Code Review Rules

### Card contract

Review every changed card against every rule of the Card contract in `docs/CARD_AUTHORING.md`. Treat a broken rule as P1. Report it with the rule's name and one concrete Session scenario: the setup, the command and the wrong result.

### Designed outcomes

- **Blocked until undo.** Under the contract's Admission rule, `engine-blocked` followed by `undoStep` / `undoAction` is the designed outcome when a choice the player accepted leaves a later mandatory step unpayable (ADR 0015, `D014_HammerCrusher`). Report `engine-blocked` when the card skipped a check of its own prerequisite, its own target or its own fee.
- **Card-level helpers.** A new file under `shared/cards/helpers/` that changes no core path is part of a card change. Report a core path changed for one card under the Closure rule.
