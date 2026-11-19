# 49. Classic Card Edition behind a build-time switch

- Status: Accepted
- Date: 2026-11-19

## Context

Classic-edition cards are being ported continuously under `shared/cards/classic/<deck>/`, with `C`-prefixed IDs (`CE203_Shepherd`, `CI097_Slaughterhouse`). Until now they were runtime-only: their impls are registered, and their Card Definitions sit in `classic-catalog.generated.ts`. They are absent from the catalog, the deal pool, the client manifest and the encyclopedia. Played from hand, they fail; scored, they give 0 VP. Rooms cannot choose decks at all; only sandboxes accept `deckIds`, limited to A–E.

The owner wants classic ports to keep merging into main while classic games stay unavailable there. Pre should make them playable through one switch commit.

## Decision

- **Card Edition.** A game deals either revised or classic occupations and minor improvements. The board, action spaces, major improvements and scoring stay those of the current revised engine. Classic cards are ported to revised rules.
- **No mixing.** A classic game deals only classic occupations and minors. The first version rejects Farmers of the Moor, the community deck, Parent Cards, Through the Seasons and solo with it.
- **One switch.** `CLASSIC_EDITION_ENABLED` is a constant in `shared/`, `false` on main, and a guard test asserts that value. The switch gates only exposure:
  - room and sandbox admission of the classic option;
  - the edition selector in the lobby (multiplayer and hotseat) and the Workshop sandbox;
  - the classic encyclopedia group.

  Pre enables it with a single commit that flips the constant and the guard test. That commit is the `classic-edition` feature in `prerelease-integration.json`.
- **Engine support is unconditional.** Main implements and tests the whole classic path: options, persistence, deal pool, lookups, manifest and display. Admission code takes the switch as an injectable parameter, so tests cover both states.
- **Lookups and enumerations.**
  - Lookups by ID find classic Card Definitions for cost, VP, prerequisites and kind. `C` prefixes never collide with revised IDs.
  - Enumerations of the catalog, the deal pool and counts stay per edition, and revised enumerations never include classic cards.
- **Options and persistence.**
  - The edition and its chosen classic decks are additive optional fields in game state, room meta, checkpoints, rematch and lobby flags. An absent field means revised, so retained games need no migration.
  - A classic game rebuilds fallback or legacy decks from its own edition, never from A–E.
- **Classic decks.**
  - The creator picks among the classic deck directories (CE, CI, CK, CZ, CWM, CFL, …). The default is CE + CI + CK.
  - Only implemented cards are dealt, with the cards' player-count limits applied.
  - When the implemented pool cannot fill every hand for the chosen players and variant, the server rejects creation with an explicit error. The UI shows each deck's implemented count and disables decks with none. Revised cards never fill a gap.
- **Client.**
  - The manifest always includes ported classic cards, so classic faces render on main too.
  - Display numbers keep the ID prefix: classic `CE203`, revised `E203`. Dev input accepts `CE203` as well as `E203`.
  - Missing translations fall back to the source's English text, as for any card.
- **Encyclopedia.** One top-level classic group, filtered by deck, shown only when the switch is on.

## Consequences

- Classic ports gain real Session coverage on main: played from hand, paying cost and scoring.
- The client manifest grows with each ported card. The encyclopedia and the deal pool do not grow while the switch is off.
- A classic game is only as playable as its implemented pool, and creation tells players so.
- Every prerelease sync rebases the switch commit. Formal release of classic games needs a later decision that flips the constant on main.

## Alternatives

- **Gating by `RELEASE_CHANNEL`.** Pre would need no commit, but channel logic would enter shared rules, and the browser Worker cannot read the server's environment.
- **A separate classic manifest loaded on demand.** It keeps the formal manifest small, but adds a second loading path for a few hundred cards.
- **Filling short pools with revised cards.** It breaks the rule that editions never mix in one game.
