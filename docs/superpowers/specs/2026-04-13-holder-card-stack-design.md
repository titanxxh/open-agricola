# Holder Card Stack Design

## Goal

Add ordered resource stack support to CardState for cards that store mixed resource types in a specific order (LIFO). Implement 3 validation cards: A102_Grocer, B83_MuddyPuddles, E40_BeeStatue.

## Architecture

Extend `CardState` with `stack?: string[]` for ordered storage. Add helpers in `card-state.ts`. Cards use stack in their onBuy/listener handlers directly — no new actions needed. Frontend `PlayedCardStats` renders stack as ordered resource icons.

## Backend Changes

### 1. CardState type

File: `shared/game/types.ts`

Add to CardState:
```typescript
stack?: string[]
```

### 2. card-state.ts helpers

File: `shared/cards/helpers/card-state.ts`

```typescript
export const getCardStack = (player: PlayerState, cardId: string): string[] =>
  player.cardStates?.[cardId]?.stack ?? []

export const pushToCardStack = (player: PlayerState, cardId: string, items: string[]): void => {
  const state = ensureCardState(player, cardId)
  if (!state.stack) state.stack = []
  state.stack.push(...items)
}

export const popFromCardStack = (player: PlayerState, cardId: string): string | undefined => {
  const stack = player.cardStates?.[cardId]?.stack
  if (!stack || stack.length === 0) return undefined
  return stack.pop()
}
```

Stack convention: bottom is index 0, top is last element. `pop()` takes from top (LIFO).

### 3. Serialization

Check `shared/game/serialization.ts` — `CardState` is serialized via `structuredClone` or JSON. `stack` is a plain string array, so no special handling needed.

## Frontend Changes

### PlayedCardStats — render stack

File: `src/components/board/FarmBoard.tsx`

In `PlayedCardStats`, after rendering `visibleCounters`, check for `stack` and render it as a row of individual resource icons (not merged by count):

```tsx
{stack.length > 0 && (
  <div className="card-stack">
    {[...stack].reverse().map((res, i) => (
      <span key={`stack-${i}`} className={`res-icon res-icon-${res}`} title={`#${stack.length - i}: ${res}`} />
    ))}
  </div>
)}
```

Reversed so top-of-stack displays first (leftmost). Props: pass `stack` from `cardStates[cardId]?.stack ?? []`.

### CSS

```css
.card-stack {
  display: flex;
  gap: 1px;
  flex-wrap: wrap;
  padding: 2px 4px;
}
```

## Card Implementations

### A102_Grocer (Occupation)

**BGA:** On buy, place 8 goods on card in order: wood, grain, reed, stone, vegetable, clay, reed, vegetable. At any time, pay 1 food to take top good. If last good taken, also pay 1 food.

- `onBuy`: push stack `['wood', 'grain', 'reed', 'stone', 'vegetable', 'clay', 'reed', 'vegetable']`
- Anytime listener (`phases: ['anytime']`): check `stack.length > 0 && food >= 1`. Pop top, gain it, pay 1 food.
- Label: show top resource type in button text

### B83_MuddyPuddles (Minor Improvement)

**BGA:** On buy, place 5 goods: sheep (bottom), food, cattle, food, pig (top). At any time, pay 1 clay to take top good.

- `onBuy`: push stack `['sheep', 'food', 'cattle', 'food', 'boar']`
- Anytime listener: check `stack.length > 0 && clay >= 1`. Pop top, gain it, pay 1 clay.

### E40_BeeStatue (Minor Improvement)

**BGA:** On buy, place 5 goods: grain (bottom), stone, grain, stone, vegetable (top). When you use Day Laborer, take top good.

- `onBuy`: push stack `['grain', 'stone', 'grain', 'stone', 'vegetable']`
- Listener: `actions: ['place-farmer']`, `phases: ['after']`, filter `space.id === 'day-laborer'`. Pop top, gain it.
- NOT anytime — triggers on specific action.

## Out of Scope

- 12 single-type + 3 mixed-unordered holder cards (use existing `counters`, implement separately)
- Animal holder zones (E86_PenBuilder pattern, already done)

## Change Summary

| File | Change |
|------|--------|
| `shared/game/types.ts` | Add `stack?: string[]` to CardState |
| `shared/cards/helpers/card-state.ts` | Add getCardStack, pushToCardStack, popFromCardStack |
| `src/components/board/FarmBoard.tsx` | Render stack in PlayedCardStats |
| `src/App.css` | `.card-stack` styles |
| `shared/cards/A/A102_Grocer.ts` | New: onBuy + anytime listener |
| `shared/cards/B/B83_MuddyPuddles.ts` | New: onBuy + anytime listener |
| `shared/cards/E/E40_BeeStatue.ts` | New: onBuy + place-farmer listener |
| `server/__tests__/*.test.ts` | 3 session test files |
| `shared/i18n/en.ts`, `zh.ts` | Anytime button labels |
