# Action Space Left Neighbors

This document records the current physical "left action space" mapping used by `A171_Sidekick` and the action-board hover tooltip.

Source of truth:

- Rules helper: `shared/cards/helpers/round-action-topology.ts`
- Card effect: `shared/cards/A/A171_Sidekick.ts`
- UI tooltip: `client/components/board/ActionBoard.tsx`

## Meaning

"Left" means the nearest action space whose board rectangle is immediately to the physical left of the current action space on the same horizontal band.

Important details:

- `R1` to `R14` below mean the current action occupying round slots 1 to 14, not fixed action ids.
- A revealed round slot participates as a physical board rectangle.
- An unrevealed or missing round slot blocks that physical position; the lookup does not skip over it to a farther-left action.
- Player action card spaces are not part of this board-left mapping.
- Rows not listed for an action mean that action currently has no left neighbor.

## Shared Mapping

These mappings apply whenever both actions are present on the current player-count board.

| Current action | Left action |
|---|---|
| `forest` | `grain-seeds` |
| `clay-pit` | `farmland` |
| `reed-bank` | `lessons` |
| `fishing` | `day-laborer` |
| `R1` | `farm-expansion` |
| `R2` | `R1` |
| `R3` | `R2` |
| `R4` | `R3` |
| `R5` | `forest` |
| `R6` | `R5` |
| `R7` | `R6` |
| `R8` | `clay-pit` |
| `R9` | `R8` |
| `R10` | `fishing` |
| `R11` | `R10` |
| `R13` | `R12` |
| `R14` | `R13` |

## 3 Players

Additional mappings on the 3-player board:

| Current action | Left action |
|---|---|
| `meeting-place` | `grove` |
| `lessons` | `lessons-3` |
| `farmland` | `hollow` |

## 4 Players

Additional mappings on the 4-player board:

| Current action | Left action |
|---|---|
| `farm-expansion` | `copse` |
| `grain-seeds` | `resource-market-4` |
| `meeting-place` | `grove` |
| `farmland` | `hollow-4` |
| `lessons` | `lessons-4` |
| `day-laborer` | `traveling-players` |

## 5 Players

Additional mappings on the 5-player board:

| Current action | Left action |
|---|---|
| `farm-expansion` | `copse-56` |
| `copse-56` | `lessons-56-2f` |
| `meeting-place` | `grove-56` |
| `grove-56` | `riverbank-forest-56` |
| `farmland` | `modest-wish-children-56` |
| `modest-wish-children-56` | `lessons-56-variable` |
| `lessons` | `resource-market-56` |
| `resource-market-56` | `animal-market-56` |
| `day-laborer` | `hollow-56` |
| `traveling-players-56` | `house-building-56` |
| `R12` | `traveling-players-56` |

## 6 Players

The 6-player board includes the 5-player mappings plus these additional mappings:

| Current action | Left action |
|---|---|
| `lessons-56-2f` | `farm-supplies-6` |
| `riverbank-forest-56` | `resource-trade-6` |
| `animal-market-56` | `improvement-6` |

