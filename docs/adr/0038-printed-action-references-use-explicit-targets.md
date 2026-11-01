# 38. Printed action references use explicit targets

- Status: Accepted
- Date: 2026-11-01

Card text distinguishes using an Action Space from receiving a Rule Action. BGA's emphasis markup does not encode that distinction: both can use the same emphasized name. Translations also contain aliases, and a reference can cover several spaces or player-count versions.

Printed references therefore identify their targets independently of the translated label. Language sources encode `__space:id[,id]|label__` and `__moor:id[,id]|label__`. Ordinary actions and other card names retain plain emphasis. The initial migration reviews English meaning and aligns translations; the browser never infers target identity from wording. The language repository preserves reviewed identities during BGA imports and flags unmatched labels for review.

The frontend inspects static printed rules. A build projection contains applicable counts, base rule descriptions and Moor card art, without game state or reveal order. Game and Replay views provide only player-count context. This supports references to unrevealed spaces without exposing their position in a particular game.

Official references must resolve during the catalog build. Invalid authored targets produce a visible inspection error, while missing art retains the localized rule explanation. Parsing, presentation seams and verification pointers are in [Client architecture](../architecture/client.md#card-action-references).
