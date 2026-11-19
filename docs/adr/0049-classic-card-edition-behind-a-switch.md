# 49. Classic Card Edition behind a build-time switch

- Status: Accepted
- Date: 2026-11-19

## Context

Classic-edition cards are being ported continuously under `shared/cards/classic/<deck>/`, with `C`-prefixed IDs (`CE203_Shepherd`, `CI097_Slaughterhouse`). Until now they were runtime-only: their impls are registered, and their Card Definitions sit in `classic-catalog.generated.ts`. They are absent from the catalog, the deal pool, the client manifest and the encyclopedia. Played from hand, they fail; scored, they give 0 VP. Rooms cannot choose decks at all; only sandboxes accept `deckIds`, limited to A–E.

The owner wants classic ports to keep merging into main while classic games stay unavailable there. Pre should make them playable through one switch commit.

## Decision

- **Card Edition.** A game deals either revised or classic occupations and minor improvements. The board, action spaces, major improvements and scoring stay those of the current revised engine. Classic cards are ported to revised rules.
- **No mixing.** A classic game deals only classic occupations and minors. The first version rejects Farmers of the Moor, the community deck, Parent Cards, Through the Seasons and solo with it. The snake opening only orders players and stays available. A Workshop sandbox keeps the author's own Workshop cards, which belong to no edition.
- **One switch.** `CLASSIC_EDITION_ENABLED` is a constant in `shared/`, `false` on main, and a guard test asserts that value. The switch gates only exposure:
  - room and sandbox admission of the classic option;
  - the edition selector in the lobby (multiplayer and hotseat) and the Workshop sandbox;
  - the classic encyclopedia group.

  It never gates loading, continuing, reconnecting to or replaying an existing classic game. A rematch is a new creation and is gated.

  Pre enables it with a single commit that flips the constant and the guard test. That commit is the `classic-edition` feature in `prerelease-integration.json`.
- **Engine support is unconditional.** Main implements and tests the whole classic path: options, persistence, deal pool, lookups, manifest and display. Admission code takes the switch as an injectable parameter, so tests cover both states.
- **Lookups and enumerations.**
  - Lookups by ID find classic Card Definitions for cost, VP, prerequisites and kind. `C` prefixes never collide with revised IDs.
  - Enumerations of the catalog, the deal pool and counts stay per edition, and revised enumerations never include classic cards.
- **Options and persistence.**
  - The edition and its chosen classic decks are additive optional fields in game state, room meta, checkpoints, rematch and lobby flags. An absent field means revised, so retained games need no migration.
  - A classic game rebuilds fallback or legacy decks from its own edition, never from A–E.
  - Once pre enables the switch, classic card IDs and behaviour fall under the retained-game compatibility rules, as revised cards do.
- **Classic decks.**
  - Classic sources are implemented cards only, enforced by a static check, so ported and implemented mean the same set.
  - The selectable decks are those with at least one ported card, shown by their codes (`CE`, `CI`, `CK`, …).
  - The default is whichever of CE, CI and CK has cards. If none has, the default is every deck that does.
  - Only eligible cards are dealt and counted: those of the chosen decks whose player-count limits admit the room's player count.
  - When the eligible pool cannot fill every hand for `maxPlayers` and the variant, the server rejects creation with an explicit error, and dealing asserts the same. Hands never shrink, and revised cards never fill a gap.
  - The UI derives each deck's eligible count from the manifest for the chosen player count. It disables decks with none and disables creation with the server's message; no extra API exists.
- **Client.**
  - The manifest always includes ported classic cards, so classic faces render on main too.
  - Display numbers keep the ID prefix: classic `CE203`, revised `E203`. Dev input accepts `CE203` as well as `E203`.
  - Missing translations fall back to the source's English text, as for any card.
- **Encyclopedia.** One top-level classic group, filtered by deck, shown only when the switch is on.

## Consequences

- Classic ports gain real Session coverage on main: played from hand, paying cost and scoring.
- The client manifest grows with each ported card. The encyclopedia and the deal pool do not grow while the switch is off.
- A classic game is only as playable as its eligible pool, and creation tells players so. Until enough cards are ported, only smaller classic games pass the check.
- Main covers the switch-on path through injectable admission and component tests. One end-to-end case runs only with the switch on, so pre verification covers the whole path.
- Every prerelease sync rebases the switch commit. Formal release of classic games needs a later decision that flips the constant on main.

## Alternatives

- **Gating by `RELEASE_CHANNEL`.** Pre would need no commit, but channel logic would enter shared rules, and the browser Worker cannot read the server's environment.
- **A separate classic manifest loaded on demand.** It keeps the formal manifest small, but adds a second loading path for a few hundred cards.
- **Filling short pools with revised cards.** It breaks the rule that editions never mix in one game.
