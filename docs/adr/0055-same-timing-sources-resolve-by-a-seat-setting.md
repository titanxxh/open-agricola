# 55. Same-timing sources resolve by a seat setting

- Status: Accepted
- Date: 2026-11-24

## Context

[ADR 0008](0008-node-parallel-reaction-dispatch.md) moved same-timing card reactions into `ParallelNode(mode='trigger-select')` but left thirteen stage hooks serial: cards resolved one by one in play-zone order with no choice. The 2026-11-23 audit ([#2039](https://github.com/titanxxh/open-agricola/issues/2039)) found that the Stage Dispatch windows themselves differed in order, Pass and preview rules, and that cards with the same printed timing sat in different hooks. `CFL027_TrappistBeer` and `CFL061_BlacklegChicken`, both "at the start of each harvest", landed in two windows, so skipping the Harvest also cancelled the Chicken ([#2033](https://github.com/titanxxh/open-agricola/issues/2033)).

The reference `ParallelNode::getChoices` resolves an *independent* mandatory child (a gain without animals, a counter update) before the player orders the rest, auto-chooses a sole choice, and keeps Pass when every remaining child is optional. OA's selector asked for every order, including two plain gains.

## Decision

- **One window model.** Stage windows become frozen-order reaction windows: the player order is frozen at window entry, clockwise from the Start Player (Harvest windows leave out players who skip the Harvest); each player's sources are captured on entry and previewed on clones; optional sources can be passed together. The start-of-Harvest window was the first to use it; the work-end, Before-Harvest, field-phase and before-end windows followed, and the field-phase windows also leave out a player who skips the field and breeding phases, as the reference does. The four return-home windows and the two round-end windows followed next. The other serial hooks follow in later #2039 changes.
- **A seat setting decides auto-resolution.** `PlayerState.preferences.autoResolveIndependentReactions` (absent means on) governs every trigger selector whose children are card activations, both stage windows and action reactions. When on, the first applicable mandatory independent source resolves before the player orders the rest. A sole applicable mandatory source resolves in either setting. Independence is a pure check of the previewed result: a mandatory flow of non-animal `gain`, card storage, bonus points or bookkeeping `special-effect` leaves, or a stage effect that only changes state.
- **The chooser's value is frozen on the selector** when it is first evaluated and kept in the engine cursor. The chooser is the reacting card's owner, so an opponent's independent reactions resolve inside the actor's command without a handoff.
- **Exceptions keep the player in control:** a sole optional source keeps [card, Pass], because accepting an activation also accepts a card's leaf-root optional effect and counts a listener use; a selector that opens its own anytime window resolves nothing by itself while a dormant source remains; extra-turn providers and injected windows never auto-resolve.
- **The setting is game state, not a live account lookup.** An account default (`user_game_preferences`) is copied into each seat when its game starts; the seat changes it through `setPlayerPreferences`, a recorded step that adds no undo history and that undo keeps. Rules never read accounts, so undo, restore and Replay stay deterministic.
- **Printed timing decides the window.** Cards with the same printed timing share one hook (the table in `CARD_AUTHORING.md` §4.3). Deliberate differences from the reference, which assigns each card on its own:
  - The returning home phase is split by wording: "at the start of the returning home phase" is `onStartReturnHome`, "in the returning home phase" is `onReturnHome`. `A152_NightSchoolStudent` and `C097_SeedResearcher` keep the reference's start of the phase.
  - `onReturnHome` runs before ordinary people come home; the reference's ReturnHome runs after. "Immediately after each returning home phase" gets its own `onAfterReturnHome` (`D018_SteamPlow`, ReturnHome in the reference).
  - `B140_FarmyardWorker` resolves at the end of the work phase as printed (AfterWorkPhase in the reference), so a good placed by an earlier source of that window counts.
  - `CWM023_ForestFarmer` ("after the work phase and before returning home") shares `onBeforeReturnHome` with `B117_Informant` and `D051_Archway`.
- **A skip decided at the start of the Harvest takes effect after that window**, so the same window's other effects still fire; a skip scheduled earlier (`C108_Layabout`) still keeps its owner out of the window.

## Consequences

- Players no longer confirm reactions that only gain goods; the setting restores manual ordering, and tests that check an order turn it off.
- An auto-resolved independent source can change another source's condition before the player chooses; this is the reference trade-off.
- Bookkeeping that ran as a stage hook moved to round-keyed card state, and random draws moved into action leaves, so previews and selectors never mutate or roll.
- A card moved to the work-end window resolves before the undo boundary that opens returning home, like the cards already there.
- Compatibility with retained games is waived (#2039): a game paused inside a migrated window when the change ships resumes it under the new rules and may be offered a source again or skip one; a game paused between a card's old and new window may miss or repeat that card once.

## Alternatives considered

- Always asking for an order: correct but slow for plain gains, and the reference does not ask.
- Reading the account preference during evaluation: undo, restore and Replay would change when the account changes.
- Auto-expanding a sole optional activation into the card's choice: it would accept leaf-root optional effects without asking.
