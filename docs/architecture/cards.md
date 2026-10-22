# `shared/cards/`: Card Source closure

[English](cards.md) | [中文](cards_zh.md)

This module owns every card's single source and the generic seams a card plugs into: hooks and listeners ([hooks](hooks.md)), local state, Card Fields and capability metadata. A card's ability stays closed inside its own file.

## Card Source and projections

A card author maintains one Card Source ([ADR 0002](../adr/0002-card-source-manifest-projection.md)):

```ts
export const CardName = defineOccupationCard({   // the constant shares the file name
  meta: { id, name, deck, number, category, desc, cost, players },
  impl: { modifiers, listeners, effect, prerequisiteCheck, reaches },
})
```

| Concept | Form | Readers |
|---|---|---|
| Card Source | `shared/cards/{A..E,M,major,community}/{Card}.ts`, containing `meta` and optional `impl` | Server, sandbox and tests; forbidden from the main client bundle |
| Card Display | `public/cards-manifest.json`, built from Card Source `meta` | Main client bundle through `client/services/card-meta` |
| Card Impl | Card Source `impl`, collected into the generated `ALL_CARD_IMPLS` (`shared/cards/register-all.ts`, majors included) and `CardRegistry` | Server and sandbox; forbidden from the main client bundle |

- `meta` is the Card Definition: serializable, frontend-visible fields without runtime behavior. Declarative rule fields (`cost`, `prerequisite`, `*Prerequisites`, `cardField`, `isCookery`, capability metadata) are allowed; `modifier(s)`, `listeners`, `effect` and `prerequisiteCheck` are not. `desc` and `prerequisite` are printed text; optional localizable `rules` is a supplemental ruling with no runtime effect. Static conditions use `*Prerequisites`; dynamic ones use `impl.prerequisiteCheck`.
- `impl` holds `modifiers`, `listeners`, `effect`, `prerequisiteCheck`, helper calls and `reaches`. Builders may project `reaches` to the manifest top level, never into `meta`.
- `scripts/build-cards-manifest.ts` extracts `meta` statically with the TypeScript AST and never imports a Card Source at runtime; `meta` contains only JSON-like literals and simple same-file constants.
- `definePlayerActionCard` declares `playerActionCardType`; the deal pool and UI use it rather than card numbers or i18n.
- Production descriptions render resources, animals, terrain and points as `ResourceText` icon tokens; `__…__` marks exact card, action and space names. `scripts/__tests__/card-description-icons.test.ts` and `card-description-double-underscore.test.ts` gate this.
- Card faces, trigger labels, log previews and Replay share `client/components/common/cardText.ts`: each name or text field falls back on its own from the canonical translation to `meta.locales[locale]` (empty values skipped) to source metadata, names also accept legacy `cards.<id>.name` aliases, and card-owned prompts reference names with `{card:<id>}`. Player names follow the generated-name provenance in `client/utils/player-name.ts` ([client](client.md)).

Tests: `shared/cards/__tests__/card-source-representatives.test.ts`, `scripts/check-generated-cards-sync.ts`.

## Generated catalog and registry

| File | Role |
|---|---|
| `shared/cards/catalog.generated.ts` | Generated from Card Sources: `catalogCardDefinitions`, the card lists (`minorImprovementCardsList`, `occupationCardsList`, `implemented*CardsList`) and ID lists |
| `shared/cards/register-all.ts` | Generated `ALL_CARD_IMPLS`, the resolved Card Impl map (`scripts/generate-register-all.ts`) |
| `shared/cards/catalog.ts` | Catalog facade, such as `minorImprovementCards` / `occupationCards` without community cards |
| `shared/cards/active-registry.ts` | Temporary synchronous `CardRegistry` scope; no persistent default |
| `shared/cards/registry.ts` | `CardRegistry` with `loadByIds` and `unload` for per-room loading |
| `shared/cards/custom-registry.ts` | Server and sandbox runtime implementation, session context, effects, listeners and modifiers for `CUSTOM_*` cards |
| `shared/cards/custom-card-metadata.ts` | Frontend `CUSTOM_*` Card Display, artwork URL and O number |

- Production paths access cards only through the generated catalog and `CardRegistry`; tests may import a single Card Source. Card Definitions are plain data with `kind: 'minor' | 'occupation' | 'playerAction' | 'major'`.
- The generated catalog must stay in sync (`pnpm run check:generated-cards-sync`); Workshop PR generation patches fetched upstream generated files, never the deployment host's local tree.
- An implementation-bearing major source enters the backend through two generated paths: `scripts/generate-register-all.ts` adds it to `ALL_CARD_IMPLS`, and `major/runtime.generated.ts` supplies `majorCardSources`, whose `impl.effect` `shared/cards/major/index.ts` merges into the major Card Definitions.
- The server and sandbox register only custom runtime parts; the main client registers only display metadata and never imports the custom runtime registry.

## Local state in `cardStates`

- Persistent counters, one-time flags and local state live in `player.cardStates[cardId]`, never top-level `PlayerState`. History a card needs before it is played uses an explicit hand-zone listener ([Hook system](hooks.md#hook-system)), not a global statistic.
- Shared exceptions are facts several cards and the farm geometry rely on: `player.farmyardSpaceStates` (blocked spaces, farmyard and field goods tokens, non-field crop spaces; placement lock is distinct from used / unused) and `player.farmyardExtensions`.
- A later player choice is an explicit continuation: the card returns a flow whose leaf issues a request and waits in a `pending` envelope, never in a hidden shared slot.
- Held workers use `shared/cards/helpers/card-held-workers.ts`; return home releases them. `family-growth` may place a newborn directly on a card through `actionContext.holdNewbornOnCard`.
- Read-only UI markers (`extraData.farmTerrainMarkers`) and cross-player public markers (`extraData.publicCardMarkers`, scored through `cardBonusVp`) are rendered generically.
- **Visibility** ([ADR 0023](../adr/0023-explicit-card-state-visibility-and-presentation.md)): card state is internal by default. Native `presentation` declarations and `getStatePresentation(player)` opt facts into public adapters; serialization records normalized `cardStatePresentation`, stripped on rehydration. Player-private `privateData` follows the storage player, not the current holder. Viewer snapshots, events, histories and seat-view Replay expose only public facts and the viewer's own private data, even to the card's owner; authoritative state, recovery, undo, debug full state and all-open Replay keep raw state. `card.stateChanged` events carry keys without values, and projection strips values from historical events without rewriting Frames.
- `getRuleContributions(player)` exposes read-only component reservations and unused-space reductions; consumers combine unique sources, floor finite values, reject negatives and non-numbers, and cap deductions. Generic stable discovery and return dispatch by `sourceCardId`, and only the source changes its construction state. Query inputs and results are detached from storage, for native and Workshop cards alike.

Tests: `server/__tests__/card-state-visibility-session.test.ts`.

## Helpers under `shared/cards/helpers/`

- `pay-gain-node.ts`: pay-then-gain, pay-then-action and return-then-gain templates.
- `reserved-resources.ts`: `evaluateWithReservedResources()` checks an action after subtracting a resource reservation; `evaluateWithGrantedResources()` checks it after adding a preceding reward. Both pass a copied player and matching state view to the evaluator without changing stored resources.
- `stage-effects.ts`: stage-effect flags and optional once-per-card Harvest exchanges through the existing exchange executor.
- `card-state.ts`, `round-placement.ts`: one-time state, the raw Work Placement Chronology and Person Placement Order ([Turn Scope and Action-Execution Scope](session.md#turn-scope-and-action-execution-scope)).
- `turn-token.ts`: the active Turn Scope identity and a card's once-per-Turn records. `isUsedThisTurnOrGap` / `markUsedThisTurnOrGapLeaf` also give the gap between two of the player's Turns (other players' Turns, harvest, round end and start) one record of its own; only an explicit `turnScopeProjection` from ordinary-placement admission previews the next Turn as unused. Actual anytime, pending and replacement queries retain the current gap. `action-snapshot.ts`: the Turn start snapshot ([Turn Scope and Action-Execution Scope](session.md#turn-scope-and-action-execution-scope)).
- `card-held-workers.ts`, `card-field.ts`: held workers ([Local state in cardStates](#local-state-in-cardstates)) and Card Fields ([Card Fields and the Logical Field seam](#card-fields-and-the-logical-field-seam)).

## Card Fields and the Logical Field seam

See [ADR 0017](../adr/0017-logical-field-ownership-boundary.md).

```ts
cardField?: {
  allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]
  capacity: number
}
```

- `makeCardFieldImpl(cardId, def, options?)` registers the Card Field owner and derives sow integration; a card adds only configuration and optional `onReap` / `onCropRemoved` callbacks. Virtual columns come from `deriveVirtualTileCol(cardId, slotIdx)`.
- The card-facing interface has three entries: `getLogicalFields(player)` (an immutable projection of Farmyard Fields plus every played Card Field, including empty fixed slots), `getFarmyardFields(player)` (geometry, fencing, adjacency, occupancy), and `mutateLogicalFields(state, player, options?)` with named `place`, `insertBottom`, `grow`, `remove` and atomic `replace`, which validates the target and then writes through the owning adapter.
- Storage accepts every legal field good. `allowedCrops` is the ordinary Sow capability, not the storage schema: `place` enforces it unless a card effect bypasses it explicitly; Sow and `replace` always enforce it; `insertBottom` adds a rule-granted crop under the top without a new slot or the Sow whitelist.
- `fieldOperationFlow` `move` accepts `sourceCrops`; the destination continuation rechecks the source crop and quantity, destination occupancy and `allowedCrops` before storing positions or mutating.
- Card Field slots store a top `{ crop, remaining }` and optional `below` layers. Normal Reap takes one crop per occupied slot; extra and whole-field harvest continue through lower layers.
- A Card Field has one stable Logical Field id and one `groupKey`; its slots keep stable coordinates. Base field scoring counts Farmyard Fields only.
- `onReap` runs only for reap; `onCropRemoved` for every real removal. Each runs after the shared mutation, once per crop, and returned flows join the ordinary parallel reaction. A selection resolves a removal callback's flow before its next parent continuation.
- `reap` is the single reaping implementation for both storage owners ([Stage hooks](hooks.md#stage-hooks)). A multi-slot Card Field reaps every occupied slot but counts once per Logical Field and crop.
- The low-level adapter inside `card-field.ts` is the only Card Impl code that touches `PlayerState.fields`; `check:card-impl-boundaries` rejects any property or bracket access named `fields` in other production card and helper sources, whatever the receiver, with no allowlist.

Tests: `shared/cards/__tests__/{AB,CD,EM}-logical-field-boundary.test.ts`, `shared/actions/effects/__tests__/{reap,sow-permissions}.test.ts`.

## Naming, capabilities and boundaries

- Card files use `{Deck}_{Number}_{Name}.ts` and export a constant with the same name; a major-family file such as `major/fireplace.ts` exports each physical card it holds.
- A card's ability stays inside its file. Core files such as `shared/actions/effects/pay.ts`, `shared/actions/effects/improvement.ts`, `shared/session/session-core.ts` and `server/game/authoritative-session.ts` never change for one card; there is no centralized card-effect registry and no frontend card rule.
- Extract a shared helper or generic mechanism only when it serves at least two current or near-term target cards; until then the logic stays in the card file.
- Cross-card identity and capability queries use typed metadata and played-card helpers: `getPlayedCardDefinitions(player)`, `collectCardDefinitionsAs(player, type)` and `playerHasCardCapability(player, capability, { asType? })`, reading only played zones; `asType` reuses `cardCountsAs` for dual-type identity. Registered capability metadata (the `CardCapability` union in `shared/cards/helpers/card-type.ts`, such as `fireplaceIdentity`, `joineryIdentity`, `blocksRenovation` and `animalHolder`) lives in `meta` and adds no frontend behavior. `ovenIdentity` is OA's oven-family identity and does not imply a baking exchange; an upgrade can keep scoring identity and opt out of build triggers with `firewoodBuildTrigger: false`.
- `check:card-impl-boundaries`, part of `pnpm run check:architecture`, rejects runtime reads of another non-major card's ID in production Card Sources. Explicit exceptions are `Major_*`, `reaches`, `allowedPurchases` and prerequisite candidate lists.
- A card whose printed text names another card may declare it as a named printed target in `reaches` and read only its public facts (existence, owner, played status), never its private state; a checker exception binds one exact source-target pair.
- Metadata audits must cover new metadata fields with fixtures.

## Minor-improvement passing

`CardDefinition.passing?: boolean` marks a minor that is passed after purchase. The improvement host completes payment through its internal `pay` child, then commits the purchase in `completeInternalChildren`: the card goes to the next player's `minorHand` (not `minorPlayed`), does not count toward `totalMinorBuilt`, adds no modifiers, emits `card.passed` instead of `card.played`, and `onBuy` still runs through `activate-card-effect` in `afterHostCommitListeners`. Card-entered-play reactions skip it naturally. The client animates `card.passed` and the mapper derives `log.cardPassed`.

