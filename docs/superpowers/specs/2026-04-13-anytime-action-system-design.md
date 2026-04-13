# Anytime Action System Design

## Goal

Allow cards to register custom anytime actions through the existing CardListener mechanism, using `phases: ['anytime']`. No new registration system needed — cards declare anytime availability the same way they declare before/after/during hooks.

## Architecture

Reuse the existing CardListener pipeline. `buildAnytimeEntries()` in game-session.ts broadcasts an anytime event (`{ actionId: 'anytime', phase: 'anytime' }`), collects matching listeners, calls each handler, and appends returned flows to the anytime action list alongside the existing hardcoded entries (exchange + reorg).

Frontend requires zero changes — `AnytimeBar` already renders `AnytimeAction[]`.

## Data Flow

```
1. Card registers listener with phases: ['anytime']
2. buildAnytimeEntries() calls getMatchingListeners({ actionId:'anytime', phase:'anytime' })
3. For each matched listener owned by current player:
   - Call handler(context) → returns { flow, labelKey, sourceCard } or void
   - void = not available right now (condition not met)
4. Each returned flow becomes an AnytimeAction descriptor (id = registration.id)
5. Frontend shows button; user clicks → takeAnytimeAction(playerIndex, registrationId)
6. Backend finds entry by id, calls engine.prependFlow(flow), runs engine steps
```

## Backend Changes

### 1. ActionHookResult — add label fields

File: `shared/actions/hooks.ts`

Add two optional fields to `ActionHookResult`:

```typescript
labelKey?: string
labelParams?: Record<string, unknown>
```

These are used by `buildAnytimeEntries()` to populate the `AnytimeAction.labelKey` shown on the frontend button. If not provided, falls back to `cards.{cardId}.anytime`.

### 2. game-session.ts — buildAnytimeEntries()

After the existing loop that scans `this.registry.values()` for `anytime: true` actions, add a second pass that broadcasts to CardListeners:

```typescript
const anytimeContext = {
  state: this.state,
  player,
  space,
  actionId: 'anytime',
  phase: 'anytime' as const,
}
const matched = getMatchingListeners(anytimeContext)
for (const entry of matched) {
  const ownerPlayer = this.state.players.find(p =>
    p.minorPlayed.includes(entry.cardId) ||
    p.occupationPlayed.includes(entry.cardId) ||
    p.improvements.includes(entry.cardId)
  )
  if (!ownerPlayer || ownerPlayer.id !== player.id) continue
  const result = executeCardListener(entry.registration, anytimeContext, {
    ownerPlayerId: ownerPlayer.id,
  })
  if (!result?.flow) continue
  anytimeEntries.push({
    descriptor: {
      id: entry.registration.id,
      labelKey: result.labelKey ?? `cards.${entry.cardId}.anytime`,
      labelParams: result.labelParams,
      sourceCard: entry.cardId,
    },
    flow: result.flow,
  })
}
```

### 3. takeAnytimeAction() — zero changes

Existing lookup logic: `buildAnytimeEntries().find(e => e.descriptor.id === actionId)`. Card-sourced entries use `registration.id` as the descriptor id, which is unique and doesn't collide with registry action ids (e.g., `'anytime-exchange'`).

## Card Registration Pattern

Each anytime card registers a CardListener with `phases: ['anytime']`:

```typescript
const CARD_ID = 'D122_ClayCarrier'

const anytimeListener: CardListenerRegistration = {
  id: 'D122-clay-carrier-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return       // once per round
    if (context.player.resources.food < 2) return             // can't afford
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          gainLeaf(CARD_ID, { clay: 2 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D122_ClayCarrier.anytime',
    }
  },
}

registerCardListener(anytimeListener)
```

Key points:
- `handler` returns `void` when conditions aren't met → action doesn't appear in UI
- `handler` returns `{ flow, labelKey }` when available → appears as button
- Once-per-round: use `flag-card` in flow + `isCardFlagged` check in handler
- Flag reset: `registerCardEffect({ id: CARD_ID, onBeforeStartOfTurn: (s, p) => setCardFlag(p, CARD_ID, false) })`

## Once-per-Round Pattern

Uses existing `flag-card` / `isCardFlagged` infrastructure:

1. Handler checks `isCardFlagged(player, CARD_ID)` → return void if flagged
2. Flow includes `{ type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID }` at the end
3. Card registers `onBeforeStartOfTurn` hook to reset: `setCardFlag(player, CARD_ID, false)`

## Validation Cards

Implement 2 cards to verify the infrastructure:

| Card | Type | Behavior |
|------|------|----------|
| D122_ClayCarrier | Simple exchange, once/round | Pay 2 food → gain 2 clay |
| E86_PenBuilder | Conditional, unlimited | Pay 1 wood → animal capacity +2 |

## Frontend Changes

None. Existing `AnytimeBar` component renders all `AnytimeAction[]` entries from `interaction.anytimeActions`. Card-sourced entries have the same shape as registry-sourced entries.

## Out of Scope

- **Event-triggered anytime** (E53_BoarSpear, A48_ShavingHorse): requires temporarily injecting anytime availability after specific events. Future extension.
- **Holder card anytime** (E27_PiggyBank): requires holder card infrastructure. Future extension.
- **C150_ParrotBreeder**: requires recording opponent's last action. Future extension.
- **ActionHookPhase type change**: `'anytime'` may need to be added to the `ActionHookPhase` union type if it doesn't already accept arbitrary strings. Check and add if needed.

## Change Summary

| File | Change | Size |
|------|--------|------|
| `shared/actions/hooks.ts` | Add `labelKey`, `labelParams` to ActionHookResult | 2 lines |
| `server/game-session.ts` | Extend `buildAnytimeEntries()` with CardListener scan | ~20 lines |
| `shared/cards/D/D122_ClayCarrier.ts` | Validation card: anytime listener | new file |
| `shared/cards/E/E86_PenBuilder.ts` | Validation card: anytime listener | modify existing |
| `server/__tests__/*` | Session tests for both cards | 2 new files |
| `shared/i18n/en.ts`, `zh.ts` | Label keys for anytime buttons | ~4 lines each |
