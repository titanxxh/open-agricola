# Future Meeples Gaps Design

## Goal

Extend the future meeples system with two capabilities: (1) variable resources per round via an entries array, (2) removal of future meeples by card ID. Implement 2 validation cards: one variable-amount card and B76_Ceilings (flagged + removal).

## Current State

`FutureMeepleRequest` accepts `{ cardId, playerId, startRound, count, resources }` — same resources for all rounds. `queueFutureMeeples()` queues the request, `resolveFutureMeepleRequests()` expands into individual `FutureMeeple` entries. No removal mechanism exists.

Existing callers: A74_StableTree, B65_GrainDepot, Major_Well — all use the simple `startRound + count` pattern.

## Changes

### 1. FutureMeepleRequest — support entries array

File: `shared/game/types.ts`

Make the request a union: either the existing simple form OR an entries-based form.

```typescript
export type FutureMeepleRequest =
  | {
      cardId: string
      playerId: string
      startRound: number
      count: number
      resources: Partial<Resource>
    }
  | {
      cardId: string
      playerId: string
      entries: { round: number; resources: Partial<Resource> }[]
    }
```

The first form (startRound/count) is the existing API — zero changes needed for current callers (A74, B65, Well).

The second form (entries array) supports variable amounts per round:
```typescript
queueFutureMeeples(state, {
  cardId: 'D43_Hutch',
  playerId: player.id,
  entries: [
    { round: state.round + 2, resources: { food: 1 } },
    { round: state.round + 3, resources: { food: 2 } },
    { round: state.round + 4, resources: { food: 3 } },
  ],
})
```

### 2. resolveFutureMeepleRequests — handle both forms

File: `shared/actions/effects/future-meeples.ts`

Detect which form by checking `'entries' in request`. For the entries form, iterate the array instead of using startRound/count loop. Same output: `FutureMeeple` entries pushed to `state.futureMeeples`.

```typescript
if ('entries' in request) {
  for (const entry of request.entries) {
    const round = clampRound(entry.round)
    if (round <= state.round) continue  // skip past/current rounds
    const resources: Partial<Resource> = {}
    addResourceCounts(resources, entry.resources)
    nextEntries.push({
      id: `${request.cardId}-${request.playerId}-${round}-${requestIndex}`,
      cardId: request.cardId,
      playerId: request.playerId,
      round,
      actionId: state.roundActionOrder[round - 1] ?? null,
      resources,
    })
  }
} else {
  // existing startRound/count logic (unchanged)
}
```

### 3. removeFutureMeeples — new helper

File: `shared/actions/effects/future-meeples.ts`

```typescript
export const removeFutureMeeples = (
  state: GameState,
  filter: { playerId: string; cardId: string; rounds?: number[] },
): void => {
  state.futureMeeples = state.futureMeeples.filter((entry) => {
    if (entry.playerId !== filter.playerId || entry.cardId !== filter.cardId) return true
    if (filter.rounds && !filter.rounds.includes(entry.round)) return true
    return false
  })
}
```

- `rounds` optional: if omitted, removes ALL future meeples from that card+player
- If provided, only removes meeples on specified rounds

### 4. Frontend

No changes. Future meeples on action spaces are already rendered via `buildStackItems()` in `ActionBoard.tsx`.

### 5. buildFutureEntries — convenience helper

File: `shared/actions/effects/future-meeples.ts`

```typescript
export const buildFutureEntries = (
  baseRound: number,
  items: { offset: number; resources: Partial<Resource> }[],
): { round: number; resources: Partial<Resource> }[] =>
  items.map(({ offset, resources }) => ({ round: baseRound + offset, resources }))
```

Usage:
```typescript
queueFutureMeeples(state, {
  cardId, playerId,
  entries: buildFutureEntries(state.round, [
    { offset: 2, resources: { food: 1 } },
    { offset: 3, resources: { food: 2 } },
    { offset: 4, resources: { food: 3 } },
  ]),
})
```

## Validation Cards

### B76_Ceilings (Minor Improvement)

**BGA behavior:** On buy: place 1 wood on each of the next 5 round spaces. At the start of those rounds, gain the wood. After renovation, remove all remaining future wood from this card and flag it (no more wood).

- `onBuy`: `queueFutureMeeples(state, { cardId, playerId, startRound: round+1, count: 5, resources: { wood: 1 } })`
- Listener: `actions: ['renovate-house']`, `phases: ['after']`. Calls `removeFutureMeeples(state, { playerId, cardId })` + flags card.
- Flag check: `isCardFlagged` in renovation listener to prevent double-trigger.

### D43 or similar variable-amount card

Pick one card from the D43-D47 series to validate the entries API. For example:

**B65_GrainDepot** already exists but uses simple form. Better to pick an unimplemented card like **D78_RoyalBedchamber** or similar that needs variable amounts. If no suitable card, create a test that validates the entries API directly.

Actually, the simplest validation: modify B76_Ceilings test to also test `removeFutureMeeples`, and add a unit test for the entries-form `resolveFutureMeepleRequests`.

## Out of Scope

- Farmer placement on round spaces (D22_WorkPermit) — separate subsystem
- Card-specific `getReceiveFlow()` at collection time — not needed for current cards
- Bulk implementation of 65+ round-card series — uses existing simple form, implement separately

## Change Summary

| File | Change |
|------|--------|
| `shared/game/types.ts` | `FutureMeepleRequest` union type with entries form |
| `shared/actions/effects/future-meeples.ts` | Handle entries form in resolve + add `removeFutureMeeples()` |
| `shared/cards/B/B76_Ceilings.ts` | Validation: onBuy + renovation removal |
| `server/__tests__/B76_Ceilings-session.test.ts` | Session test |
| `shared/actions/__tests__/future-meeples.test.ts` | Unit test for entries form + removal |
