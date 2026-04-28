import { MinorImprovement } from '../types'
import { addCardResourceGained } from '../helpers/card-state'
import { addResourcesFromCards } from '../../logic/stats'
import { registerSelectionEffect } from '../../actions/effects/selection-effect-registry'
import {
  listReturnableStableTiles,
  removeStableOrFarmHandAtTile,
} from '../helpers/stable-removal'
import type { ActionFlow, FarmTilePosition } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E76_LumberPile'
const FIELD_EFFECT = 'lumber-pile-return-stables'

/**
 * E76 Lumber Pile (Minor, E, 76):
 * - onBuy: player may immediately return up to 3 stables from the farmyard
 *   to their supply (normal stables OR the B85 FarmHand stable). Each
 *   returned stable grants 3 WOOD.
 *
 * BGA (E76_LumberPile.php): optional returnStables → max 3 stables
 * (including the FarmHand stable), then gainNode(WOOD => 3 * count).
 * Candidate listing + removal dispatch go through the shared
 * `stable-removal` helper so this card stays agnostic of the FarmHand
 * storage (see spec §3.5.1).
 */
registerSelectionEffect(FIELD_EFFECT, ({ player, positions, sourceCard }) => {
  let removed = 0
  for (const position of positions) {
    const [rowStr, colStr] = position.split('-')
    const row = Number(rowStr)
    const col = Number(colStr)
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue
    const tile: FarmTilePosition = { row, col }
    if (removeStableOrFarmHandAtTile(player, tile)) removed += 1
    if (removed >= 3) break
  }
  if (removed > 0) {
    const wood = removed * 3
    player.resources.wood = (player.resources.wood ?? 0) + wood
    if (sourceCard) {
      addCardResourceGained(player, sourceCard, { wood })
    }
    addResourcesFromCards(player, { wood })
  }
})

export const E76_LumberPile = new MinorImprovement({
  id: CARD_ID,
  name: 'Lumber Pile',
  deck: 'E',
  number: 76,
  category: 'RESOURCE_WOOD',
  desc: [
    'When you play this card, you can immediately return up to 3 <STABLE> from your farmyard board to your supply and get 3 <WOOD> for each.',
  ],
})

export const E76_LumberPile_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const selectableTiles = listReturnableStableTiles(player)
    if (selectableTiles.length === 0) return
    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'selection',
          sourceCard: CARD_ID,
          actionContext: {
            selectionKind: 'farm-position',
            selectionEffect: FIELD_EFFECT,
            maxSelections: Math.min(3, selectableTiles.length),
            selectableTiles,
          },
        },
      ],
    }
    return flow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
