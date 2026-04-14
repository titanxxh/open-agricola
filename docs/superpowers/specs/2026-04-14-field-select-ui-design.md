# Field Selection UI Design

## Goal

Add a `'field-select'` farm interaction type that lets players select specific fields on the farm board. Cards use it to implement effects like "choose N fields to apply an effect to" (e.g., D70_StrawManure: add vegetables to fields, B165_GameProvider: discard grain from fields, D72_StableManure: harvest extra from fields).

## Architecture

Follow the exact pattern of existing farm types (plow, sow, room, stable, fence). Add a 6th farm interaction type `'field-select'` to the discriminated union. Backend builds the selectable field list, frontend renders them as clickable, player selects, backend validates and applies.

## Type Definition

File: `shared/game/types.ts`

Add to `InteractionFarmSelection` union:

```typescript
| {
    farmType: 'field-select'
    selectableFields: FarmTilePosition[]
    maxSelections: number
    minSelections?: number
  }
```

- `selectableFields`: which field tiles are clickable
- `maxSelections`: max fields the player can select (e.g., 2 for D70)
- `minSelections`: optional minimum (default 0 = can skip)

## Backend

### farm-interaction.ts — builder

```typescript
export const buildFieldSelectFarmInteraction = (
  player: PlayerState,
  filter: (field: Field) => boolean,
  maxSelections: number,
  minSelections?: number,
): InteractionFarmSelection => ({
  farmType: 'field-select',
  selectableFields: player.fields
    .filter(filter)
    .map((f) => ({ row: f.row, col: f.col })),
  maxSelections,
  minSelections,
})
```

### game-session.ts — routing

1. `isFarmPromptKey`: add `case 'ui.interactionFieldSelect': return 'field-select'`
2. `buildFarmInteraction`: add `case 'field-select'` routing
3. `commitFarmChoice`: add `case 'field-select'` handling

### How cards trigger it

Cards return a choice with `promptKey: 'ui.interactionFieldSelect'` and pass filter criteria via `actionContext`. The game-session builds the interaction using the filter.

Alternative (simpler): cards return a regular `choice` with field positions as options. But using the farm UI is better UX since players click on the actual farm board.

**Recommended pattern for cards:**

```typescript
// In card listener handler:
return {
  flow: {
    type: 'leaf',
    actionId: 'field-select',
    sourceCard: CARD_ID,
    actionContext: {
      filter: 'has-vegetable',  // predefined filter name
      maxSelections: 2,
      effect: 'add-vegetable',  // what to do with selected fields
    },
  },
}
```

Actually, the simplest approach: create a `field-select` action that returns a `choice` result with `promptKey: 'ui.interactionFieldSelect'`. The game-session sees this prompt key and builds the farm interaction. The `resolveChoice` for this action receives the selected field positions and applies the effect.

But this couples the action to specific effects. Better: make `field-select` a generic action that returns selected positions, and let the calling card's flow handle the effect via subsequent actions.

**Simplest working design:**

The `field-select` action:
- `execute()`: returns `{ type: 'choice', promptKey: 'ui.interactionFieldSelect', options: [] }` with `actionContext` containing filter + maxSelections
- `resolveChoice()`: receives selected positions, stores them in `extraData.selectedFields`, returns `{ type: 'ok' }`
- Subsequent actions in the card's flow read `selectedFields` and apply effects

This keeps the field-select action generic and reusable.

## Frontend

### GameContainerApi.tsx

Add `fieldSelectableSet` memo (same pattern as `plowSelectableSet`):

```typescript
const fieldSelectableSet = useMemo(
  () => new Set(
    farmInteraction?.farmType === 'field-select'
      ? farmInteraction.selectableFields.map(positionKey)
      : []
  ),
  [farmInteraction],
)
```

Pass to FarmBoard as prop.

### FarmBoard.tsx

Add state: `pendingFieldSelections: Set<string>` (multi-select).

Render field tiles with `.field-selectable` class when in `fieldSelectableSet`. On click, toggle selection (add/remove from `pendingFieldSelections`), respecting `maxSelections`.

The confirm button sends `{ fields: [...selectedPositions] }` as the farm choice payload.

### InteractionBar.tsx

Add subtitle showing `selected/max` count (same pattern as room/stable selection).

## CSS

```css
.farm-tile.field-selectable { cursor: pointer; outline: 2px solid var(--color-primary); }
.farm-tile.field-selected { background: rgba(var(--color-primary-rgb), 0.3); }
```

## Validation Cards

Implement 2 cards to verify:

| Card | Effect | Filter | Max |
|---|---|---|---|
| D70_StrawManure | Pay 1 grain, add 1 vegetable to selected fields | has vegetable crop | 2 |
| D72_StableManure | Harvest extra from selected fields | has any crop | unfenced stables count |

## i18n

```typescript
'ui.interactionFieldSelect': 'Select Fields',
'ui.interactionFieldSelectSubtitle': 'Selected: {selected}/{max}',
'ui.interactionFieldSelectConfirm': 'Confirm',
```

## Change Summary

| File | Change |
|------|--------|
| `shared/game/types.ts` | Add `field-select` to InteractionFarmSelection |
| `server/farm-interaction.ts` | Add `buildFieldSelectFarmInteraction` |
| `server/game-session.ts` | Prompt key mapping + routing + commitFarmChoice |
| `src/app/GameContainerApi.tsx` | fieldSelectableSet + commit handler |
| `src/components/board/FarmBoard.tsx` | Render + toggle + state |
| `src/components/interaction/InteractionBar.tsx` | Subtitle for field-select |
| `src/App.css` | .field-selectable + .field-selected styles |
| `shared/i18n/en.ts`, `zh.ts` | Labels |
| `shared/cards/D/D70_StrawManure.ts` | Validation card |
| `shared/cards/D/D72_StableManure.ts` | Validation card |
