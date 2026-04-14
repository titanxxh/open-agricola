# New Hooks Design: onGainResource, afterPay, computeReplace for DayLaborer

## Goal

Add 3 new hook/extension points to support 4 specific cards: E103_Wolf (onGainResource), D74_RoyalWood (afterPay), C168_AnimalCatcher (computeReplace on day-laborer), E167_DairyCrier (multi-player onBuy choice).

## 1. onGainResource Hook

**Purpose:** Let cards react when a player gains specific resources.

**Triggered by:** `gain` action in `shared/actions/effects/gain.ts` — after resources are added to player.

**Card:** E103_Wolf — stack of clay/wood/grain (bottom to top). When player gains a resource matching the top of the stack, pop it and gain 1 pig.

**Design:**

Add to `CardEffect`:
```typescript
onGainResource?: (state: GameState, player: PlayerState, gained: Partial<Resource>) => ActionFlow | void
```

In `shared/actions/effects/gain.ts`, after `gainResources(player, gain)`, call:
```typescript
runGainResourceHooks(state, player, gain)
```

The hook runs for all cards the player has. If it returns an `ActionFlow`, the flow is queued for execution (similar to how `onComputeAnimalZones` works but with flow return).

**Alternative simpler approach:** Since gain.ts is a simple action, and the hook needs to return a flow that the engine processes, the cleanest way is to make the `gain` action's execute return a flow result when hooks fire. But `gain` currently returns `{ type: 'ok' }`.

**Simplest approach:** Use a `CardListener` on the `gain` action with `phases: ['after']`. The listener checks what was gained and reacts. E103_Wolf registers:

```typescript
registerCardListener({
  id: 'E103-wolf-after-gain',
  cardIds: [CARD_ID],
  actions: ['gain'],
  phases: ['after'],
  handler: (context) => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    const top = stack[stack.length - 1]
    // Check if gained resources include the top resource
    const gained = context.result?.resourcesGained ?? {}
    if ((gained[top] ?? 0) <= 0) return
    popFromCardStack(context.player, CARD_ID)
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
})
```

**Problem:** The `after` phase listener on `gain` action may not have `context.result.resourcesGained` available. Check if the engine passes action results to after-phase listeners.

Actually, looking at how listeners work — the `after` phase listener's `context` includes the action result via `context.result`. The `gain` action returns `{ type: 'ok', resourcesGained: gain }`. So `context.result?.resourcesGained` should work.

But wait — E103 needs to trigger on ANY resource gain, not just the `gain` action. Resources can be gained via `collect`, `receive`, `reap`, `take-from-card`, etc. A single `after:gain` listener won't catch all.

**Better approach:** Register listeners on multiple actions: `['gain', 'collect', 'receive', 'take-from-card']`. Or add a broader hook.

**BGA approach:** BGA checks `isObtainEvent` which covers Gain, Receive, Reap, Collect. E103 triggers on all of these.

**Recommended:** Register on `['gain', 'collect']` as these cover the main resource acquisition paths. Add `'receive'` if needed. The listener checks if gained resources include the stack top.

But there's another issue: `collect` is the action that collects accumulated resources from action spaces. Its result may not include `resourcesGained` in the format we need. Need to check.

**Pragmatic approach for now:** Add listeners on `gain` and `collect`. If `collect` doesn't provide `resourcesGained`, skip it and note the limitation. E103 can be extended later.

## 2. afterPay Hook

**Purpose:** Let cards react after a player pays resources, knowing exactly what was paid.

**Card:** D74_RoyalWood — at end of turn, get 1 wood back for every 2 wood paid during Farm Expansion or improvement actions.

**Design:**

Use `computeCosts` listener on `construct` and `improvement-any` actions. The `computeCosts` listener sees the cost being computed. But it doesn't know what was ACTUALLY paid (player might use trade modifiers).

**Alternative:** Use an `after` phase listener on `construct` and `improvement-any`. Track wood spent across the turn in `cardStates.extraData`. On `onReturnHome`, compute refund.

But `after` listener doesn't know what was paid either. The payment happens in the engine's cost resolution, not in the action's execute.

**Simplest approach:** Use `computeCosts` to track the base cost, accumulate in extraData. On `onReturnHome`, calculate refund. This isn't perfect (ignores trade modifiers) but is close enough.

**Even simpler:** Register `before` listener on `construct` and `improvement-any`. Snapshot `player.resources.wood` before. Register `after` listener on same. Diff = wood spent. Accumulate in extraData. `onReturnHome` refunds.

This is the same before/after pattern used by A73_AgriculturalFertilizers.

```typescript
// Before listener: snapshot wood
writeCardExtraData(player, CARD_ID, 'woodBefore', player.resources.wood)

// After listener: diff = spent, accumulate
const before = readCardExtraData(player, CARD_ID, 'woodBefore') ?? player.resources.wood
const spent = Math.max(0, before - player.resources.wood)
const total = (readCardExtraData(player, CARD_ID, 'woodSpent') ?? 0) + spent
writeCardExtraData(player, CARD_ID, 'woodSpent', total)

// onReturnHome: refund
const totalSpent = readCardExtraData(player, CARD_ID, 'woodSpent') ?? 0
const refund = Math.floor(totalSpent / 2)
if (refund > 0) player.resources.wood += refund
writeCardExtraData(player, CARD_ID, 'woodSpent', 0)
```

No new hook needed — uses existing before/after listener pattern.

## 3. C168_AnimalCatcher — computeReplace on day-laborer

**Purpose:** Replace the day-laborer action with an alternative: gain 3 different animals instead of 2 food.

**Card:** C168_AnimalCatcher — each time you use Day Laborer, instead of 2 food, you can get 1 sheep + 1 boar + 1 cattle. Must pay 1 food per remaining harvest.

**Design:**

Use `computeReplace` listener on the day-laborer's gain action:

```typescript
registerCardListener({
  id: 'C168-animal-catcher-replace',
  cardIds: [CARD_ID],
  actions: ['gain'],  // day-laborer executes a 'gain' action
  phases: ['computeReplace'],
  handler: (context) => {
    if (context.space?.id !== 'day-laborer') return
    const harvestsLeft = countRemainingHarvests(context.state.round)
    return {
      alternativeFlow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { sheep: 1, boar: 1, cattle: 1 }),
          ...(harvestsLeft > 0 ? [payLeaf({ cardId: CARD_ID, cost: { food: harvestsLeft } })] : []),
        ],
      },
      declined: false,
    }
  },
})
```

Wait — `computeReplace` returns `{ actionId, declined, alternativeFlow }`. The `declined: false` means the replacement is accepted by default, but the player should have a choice. Check how `computeReplace` works — read existing usage in `shared/cards/A/A97_Freshman.ts` or similar.

Actually, `computeReplace` with `alternativeFlow` + `declined: true` presents the player with a choice: use the original action or the alternative. That's exactly what we need.

```typescript
return {
  declined: true,  // offer choice to player
  alternativeFlow: {
    type: 'seq',
    children: [
      gainLeaf(CARD_ID, { sheep: 1, boar: 1, cattle: 1 }),
    ],
  },
}
```

The `declined: true` means "I'm declining the original action and offering an alternative" — the engine wraps this in an XOR choice for the player.

Check if the food payment per harvest should be part of the alternative flow or separate.

## 4. E167_DairyCrier — multi-player onBuy choice

**Purpose:** When played, ALL players (including owner) choose: 2 sheep or 2 food. Owner also gets 1 cattle.

**Design:**

Use `onBuy` hook. Return a flow that:
1. Owner gains 1 cattle
2. For each player, use PlayerSwitchNode to switch context and offer XOR choice (2 sheep or 2 food)

The engine already supports `PlayerSwitchNode` in flows. The user mentioned "engine should auto-insert player switch prompts when the choosing player changes." This should already work — when the engine encounters a `PlayerSwitchNode` in the flow, it creates a `confirmPlayerSwitch` pending state.

```typescript
onBuy: (state, player) => {
  const children: ActionFlow[] = [gainLeaf(CARD_ID, { cattle: 1 })]
  for (const p of state.players) {
    // Each player gets XOR choice: 2 sheep or 2 food
    // Need PlayerSwitch if p !== current player
    // But ActionFlow doesn't support PlayerSwitchNode directly...
  }
}
```

**Problem:** `ActionFlow` type doesn't have a `playerSwitch` variant. `PlayerSwitchNode` is an engine node, not an ActionFlow type. So we can't embed player switches in the flow returned from `onBuy`.

**Alternative:** Use `gain-other-players` for a simplified version — all other players get 2 food (no choice). Owner gets 1 cattle + choice of 2 sheep or 2 food.

**Or:** Return a flow with multiple gain actions and let the engine handle it. But without PlayerSwitch, all gains go to the card owner.

**Simplest approach for now:** Simplified version — owner gets 1 cattle + 2 sheep (or choice), all other players get 2 food (no choice). Close enough to BGA behavior for most games.

## Revised Design (after feedback)

### D74_RoyalWood — needs `resourcesPaid` in pay-resources result

The before/after wood snapshot approach is unreliable because other effects can change wood between before and after. Need to track actual payment amount.

**Fix:** Add `resourcesPaid` to `pay-resources` action result:

In `shared/actions/effects/pay-resources.ts`, change both return paths to include:
```typescript
return {
  type: 'ok',
  resourcesPaid: cost as Partial<Resource>,  // NEW
  logKey: 'log.cardEffectPay',
  logParams: { cost, cardId: sourceCard },
}
```

Also add `resourcesPaid` to `ActionExecutionResult`'s ok variant:
```typescript
{ type: 'ok'; logKey?: string; resourcesGained?: Partial<Resource>; resourcesPaid?: Partial<Resource>; ... }
```

Then D74 uses `after:pay-resources` listener to read `context.result?.resourcesPaid?.wood` and accumulate.

### E167_DairyCrier — needs PlayerSwitch in ActionFlow

All players must independently choose 2 sheep or 2 food. This requires `playerSwitch` type in ActionFlow.

**Fix:** Add `playerSwitch` variant to ActionFlow:

```typescript
export type ActionFlow =
  | { type: 'leaf'; ... }
  | { type: 'seq' | 'or' | 'xor' | 'parallel'; ... }
  | { type: 'playerSwitch'; targetPlayerId: string }
```

In `shared/engine/engine.ts`, `buildFlowNode()` handles this new type by creating a `PlayerSwitchNode`.

Then E167's onBuy flow:
```typescript
const children: ActionFlow[] = [gainLeaf(CARD_ID, { cattle: 1 })]
for (const p of state.players) {
  if (p.id !== player.id) {
    children.push({ type: 'playerSwitch', targetPlayerId: p.id })
  }
  children.push({
    type: 'xor',
    children: [
      gainLeaf(CARD_ID, { sheep: 2 }),
      gainLeaf(CARD_ID, { food: 2 }),
    ],
  })
  if (p.id !== player.id) {
    children.push({ type: 'playerSwitch', targetPlayerId: player.id })
  }
}
return { type: 'seq', children }
```

## Updated Change Summary

| Item | Change | Size |
|---|---|---|
| `ActionExecutionResult` | Add `resourcesPaid?: Partial<Resource>` | 1 line |
| `pay-resources.ts` | Return `resourcesPaid` in result | 2 lines |
| `ActionFlow` | Add `playerSwitch` variant | 1 line |
| `engine.ts` buildFlowNode | Handle `playerSwitch` → `PlayerSwitchNode` | 3 lines |
| E103_Wolf | `after:gain`/`after:collect` listener | Card file |
| D74_RoyalWood | `after:pay-resources` listener + `onReturnHome` refund | Card file |
| C168_AnimalCatcher | `computeReplace` on day-laborer | Card file |
| E167_DairyCrier | `onBuy` with PlayerSwitch flow | Card file |
